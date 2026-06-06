import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface ProductSearchResult {
  productoID: string;
  nombre: string;
  marca: string;
  categoria: string;
  ean: string;
  precioVenta: number;
  stock: number;
  precioOferta?: number;
  promocionNombre?: string;
}

interface ProductSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectProduct: (product: ProductSearchResult, quantity: number) => void;
  onSearch: (query: string) => Promise<ProductSearchResult[]>;
}

const ProductSearchModal: React.FC<ProductSearchModalProps> = ({
  visible,
  onClose,
  onSelectProduct,
  onSearch,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [quantity, setQuantity] = useState('1');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
      setSearchQuery('');
      setResults([]);
      setSelectedProduct(null);
      setQuantity('1');
    }
  }, [visible]);

  const handleSearch = async (text: string) => {
    setSearchQuery(text);

    if (text.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const searchResults = await onSearch(text);
      setResults(searchResults);
    } catch (error) {
      console.error('[ProductSearch] Error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectProduct = (product: ProductSearchResult) => {
    setSelectedProduct(product);
    setQuantity('1');
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;

    const qty = parseInt(quantity, 10);
    if (qty > 0) {
      onSelectProduct(selectedProduct, qty);
      setSelectedProduct(null);
      setSearchQuery('');
      setResults([]);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const renderProductItem = ({ item }: { item: ProductSearchResult }) => (
    <TouchableOpacity
      style={[styles.productItem, selectedProduct?.productoID === item.productoID && styles.productItemSelected]}
      onPress={() => handleSelectProduct(item)}
      activeOpacity={0.7}
    >
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.nombre}</Text>
        <Text style={styles.productBrand}>{item.marca}</Text>
        <Text style={styles.productStock}>Stock: {item.stock}</Text>
      </View>
      <View style={styles.productPricing}>
        {item.precioOferta ? (
          <>
            <Text style={styles.priceOriginal}>${item.precioVenta.toFixed(2)}</Text>
            <Text style={styles.priceOffer}>${item.precioOferta.toFixed(2)}</Text>
            {item.promocionNombre && <Text style={styles.promoTag}>{item.promocionNombre}</Text>}
          </>
        ) : (
          <Text style={styles.price}>${item.precioVenta.toFixed(2)}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('pos.search_product')}</Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={t('pos.search_product')}
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={handleSearch}
            editable={!selectedProduct}
          />
          {isLoading && <ActivityIndicator size="small" color="#2563EB" style={styles.searchSpinner} />}
        </View>

        {/* Product List */}
        {!selectedProduct && (
          <FlatList
            data={results}
            keyExtractor={(item) => item.productoID}
            renderItem={renderProductItem}
            style={styles.productList}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              searchQuery.length >= 2 && !isLoading ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>{t('common.no_results')}</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Product Detail / Add to Cart */}
        {selectedProduct && (
          <View style={styles.detailContainer}>
            <Text style={styles.detailTitle}>{selectedProduct.nombre}</Text>
            <View style={styles.detailInfo}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Marca:</Text>
                <Text style={styles.detailValue}>{selectedProduct.marca}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Categoría:</Text>
                <Text style={styles.detailValue}>{selectedProduct.categoria}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Stock:</Text>
                <Text style={styles.detailValue}>{selectedProduct.stock}</Text>
              </View>
            </View>

            {/* Pricing */}
            <View style={styles.pricingSection}>
              {selectedProduct.precioOferta ? (
                <>
                  <Text style={styles.labelPrice}>Precio</Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.detailPriceOriginal}>${selectedProduct.precioVenta.toFixed(2)}</Text>
                    <Text style={styles.detailPriceOffer}>${selectedProduct.precioOferta.toFixed(2)}</Text>
                  </View>
                  {selectedProduct.promocionNombre && (
                    <Text style={styles.detailPromo}>{selectedProduct.promocionNombre}</Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.labelPrice}>Precio</Text>
                  <Text style={styles.detailPrice}>${selectedProduct.precioVenta.toFixed(2)}</Text>
                </>
              )}
            </View>

            {/* Quantity Input */}
            <View style={styles.quantitySection}>
              <Text style={styles.labelQty}>Cantidad</Text>
              <View style={styles.quantityInput}>
                <TouchableOpacity
                  onPress={() => {
                    const current = parseInt(quantity, 10) || 1;
                    if (current > 1) setQuantity(String(current - 1));
                  }}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.quantityValue}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="number-pad"
                  maxLength={4}
                />
                <TouchableOpacity
                  onPress={() => {
                    const current = parseInt(quantity, 10) || 1;
                    if (current < selectedProduct.stock) setQuantity(String(current + 1));
                  }}
                  style={styles.quantityButton}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.buttonSecondary} onPress={() => setSelectedProduct(null)}>
                <Text style={styles.buttonSecondaryText}>Volver</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonPrimary, !quantity && styles.buttonDisabled]}
                onPress={handleAddToCart}
                disabled={!quantity || parseInt(quantity, 10) <= 0}
              >
                <Text style={styles.buttonPrimaryText}>Agregar al Carrito</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 8,
    marginRight: 12,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchSpinner: {
    marginLeft: 8,
  },
  productList: {
    flex: 1,
  },
  listContent: {
    padding: 12,
  },
  productItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#E5E7EB',
  },
  productItemSelected: {
    backgroundColor: '#EFF6FF',
    borderLeftColor: '#2563EB',
  },
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  productStock: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  productPricing: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  priceOriginal: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  priceOffer: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 2,
  },
  promoTag: {
    fontSize: 10,
    color: '#FFFFFF',
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  detailContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  detailInfo: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  pricingSection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
  },
  labelPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  detailPriceOriginal: {
    fontSize: 16,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginRight: 12,
  },
  detailPriceOffer: {
    fontSize: 28,
    fontWeight: '700',
    color: '#10B981',
  },
  detailPromo: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
    marginTop: 8,
  },
  quantitySection: {
    marginBottom: 16,
  },
  labelQty: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  quantityInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
  quantityButton: {
    width: 50,
    height: 50,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  quantityValue: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  buttonPrimary: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});

export default ProductSearchModal;
