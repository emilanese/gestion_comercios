import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
  KeyboardAvoidingView,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface TurnOpenScreenProps {
  operadorNombre: string;
  numeroTerminal: number;
  aliasNombre: string;
  onSuccess: (turnoID: string) => void;
  onError: (error: string) => void;
  onOpenTurn: (montoInicial: number) => Promise<{ success: boolean; turnoID?: string; error?: string }>;
}

const TurnOpenScreen: React.FC<TurnOpenScreenProps> = ({
  operadorNombre,
  numeroTerminal,
  aliasNombre,
  onSuccess,
  onError,
  onOpenTurn,
}) => {
  const { t } = useTranslation();
  const [montoInicial, setMontoInicial] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // AutoFocus en el input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleMontoChange = (text: string) => {
    // Solo permitir números y decimales
    const cleaned = text.replace(/[^0-9.]/g, '');
    setMontoInicial(cleaned);
    setError(null);
  };

  const handleOpenTurn = async () => {
    setError(null);

    // Validar monto
    const monto = parseFloat(montoInicial);
    if (!montoInicial || isNaN(monto)) {
      setError(t('errors.invalid_amount'));
      return;
    }

    if (monto < 0) {
      setError(t('errors.negative_amount'));
      return;
    }

    setIsLoading(true);
    try {
      const result = await onOpenTurn(monto);

      if (result.success && result.turnoID) {
        onSuccess(result.turnoID);
      } else {
        setError(result.error || t('errors.turn_open_failed'));
        onError(result.error || t('errors.turn_open_failed'));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      onError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: any) => {
    if (e.nativeEvent.key === 'Enter') {
      handleOpenTurn();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{t('turn.opening')}</Text>
            <Text style={styles.subtitle}>{t('turn.initial_cash')}</Text>
          </View>

          {/* Información de terminal y operador */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('labels.terminal')}:</Text>
              <Text style={styles.infoValue}>{aliasNombre}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('labels.operator')}:</Text>
              <Text style={styles.infoValue}>{operadorNombre}</Text>
            </View>
          </View>

          {/* Input de monto */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>{t('turn.enter_initial_amount')}</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                value={montoInicial}
                onChangeText={handleMontoChange}
                onSubmitEditing={handleOpenTurn}
                onKeyPress={handleKeyPress}
                editable={!isLoading}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Error message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          )}

          {/* Botón de apertura */}
          <TouchableOpacity
            style={[
              styles.button,
              isLoading && styles.buttonDisabled,
              !montoInicial && styles.buttonDisabled,
            ]}
            onPress={handleOpenTurn}
            disabled={isLoading || !montoInicial}
            activeOpacity={0.7}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" size="large" />
            ) : (
              <>
                <Text style={styles.buttonText}>{t('turn.open_cash')}</Text>
                <Text style={styles.buttonSubtext}>{t('turn.start_selling')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Help text */}
          <Text style={styles.helpText}>{t('turn.help_initial_amount')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 20,
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2563EB',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 36,
    fontWeight: '700',
    color: '#1F2937',
    paddingVertical: 16,
    paddingRight: 0,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  buttonSubtext: {
    color: '#E0E7FF',
    fontSize: 12,
    fontWeight: '500',
  },
  helpText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default TurnOpenScreen;
