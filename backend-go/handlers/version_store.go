package handlers

import (
	"context"
	"fmt"
	"log"

	"github.com/redis/go-redis/v9"
)

// ─── VersionStore ─────────────────────────────────────────────────────────────
//
// Gestiona el contador de versión secuencial por sucursal usando Redis.
// La clave de cada sucursal es "version:suc:{sucursalID}".
//
// Garantía: AtomicAdvance usa un Lua script para hacer Compare-And-Set (CAS)
// en un único comando atómico — no hay race condition posible.

const versionKeyPrefix = "version:suc:"

// luaCAS: si el valor actual == base, lo setea a newVal y retorna 1.
// Si no coincide, retorna 0 sin modificar nada.
const luaCAS = `
local current = redis.call("GET", KEYS[1])
if current == false then
  redis.call("SET", KEYS[1], "0")
  current = "0"
end
if current == ARGV[1] then
  redis.call("SET", KEYS[1], ARGV[2])
  return 1
end
return 0
`

// VersionStore encapsula la lógica de versiones en Redis.
type VersionStore struct {
	rdb *redis.Client
}

// NewVersionStore crea un VersionStore. Puede recibir nil (modo degradado sin Redis).
func NewVersionStore(rdb *redis.Client) *VersionStore {
	return &VersionStore{rdb: rdb}
}

// versionKey construye la clave Redis para una sucursal.
func (v *VersionStore) versionKey(sucursalID string) string {
	return versionKeyPrefix + sucursalID
}

// GetVersion devuelve la versión actual de la sucursal.
// Si no existe, retorna 0 y la inicializa en Redis.
func (v *VersionStore) GetVersion(ctx context.Context, sucursalID string) (int64, error) {
	if v.rdb == nil {
		return 0, nil // modo degradado
	}
	key := v.versionKey(sucursalID)
	val, err := v.rdb.Get(ctx, key).Int64()
	if err == redis.Nil {
		// Inicializar a 0
		_ = v.rdb.SetNX(ctx, key, 0, 0).Err()
		return 0, nil
	}
	return val, err
}

// AtomicAdvance realiza un Compare-And-Set atómico vía Lua:
//   - Si version[sucursalID] == baseVersion → SET newVersion → retorna (true, nil)
//   - Si no coincide → retorna (false, nil) → VERSION_CONFLICT
func (v *VersionStore) AtomicAdvance(ctx context.Context, sucursalID string, baseVersion, newVersion int64) (bool, error) {
	if v.rdb == nil {
		// Sin Redis: modo degradado — aceptar todo (no hay concurrencia garantizada)
		log.Printf("[VersionStore] ⚠️  Redis no disponible — aceptando mutación sin CAS")
		return true, nil
	}
	key := v.versionKey(sucursalID)
	result, err := v.rdb.Eval(ctx, luaCAS, []string{key},
		fmt.Sprintf("%d", baseVersion),
		fmt.Sprintf("%d", newVersion),
	).Int64()
	if err != nil {
		return false, fmt.Errorf("redis CAS error: %w", err)
	}
	return result == 1, nil
}

// InitVersion inicializa la versión de la sucursal a 0 si no existe (SETNX).
// Es seguro llamarla en cada conexión del Backoffice.
func (v *VersionStore) InitVersion(ctx context.Context, sucursalID string) {
	if v.rdb == nil {
		return
	}
	key := v.versionKey(sucursalID)
	if err := v.rdb.SetNX(ctx, key, 0, 0).Err(); err != nil {
		log.Printf("[VersionStore] Error inicializando versión sucursal %s: %v", sucursalID, err)
	}
}
