
import React, { useState } from 'react';
import { ProductItem } from '../types';
import { ShoppingBag, X, Search, ShoppingCart, ExternalLink, ArrowRight } from 'lucide-react';

interface ProductVisualDiscoveryProps {
  products: ProductItem[];
  isVisible: boolean;
}

const ProductVisualDiscovery: React.FC<ProductVisualDiscoveryProps> = ({ products, isVisible }) => {
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  if (!isVisible || products.length === 0) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      {/* Interactive Pins */}
      {products.map((product) => {
        if (!product.box_2d) return null;
        
        // Calculate center of the bounding box
        const [ymin, xmin, ymax, xmax] = product.box_2d;
        const top = ((ymin + ymax) / 2) / 10;
        const left = ((xmin + xmax) / 2) / 10;

        return (
          <button
            key={product.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProduct(product);
            }}
            className="absolute pointer-events-auto group/pin transition-transform hover:scale-125 focus:outline-none"
            style={{ top: `${top}%`, left: `${left}%` }}
          >
            {/* Pulsing Aura */}
            <div className="absolute -inset-4 bg-secondary/30 rounded-full blur-xl animate-pulse group-hover/pin:bg-secondary/50 transition-all" />
            
            {/* Pin UI */}
            <div className={`
              w-6 h-6 rounded-full border-2 transition-all duration-500 flex items-center justify-center
              ${selectedProduct?.id === product.id 
                ? 'bg-secondary border-white scale-125 shadow-[0_0_20px_rgba(170,196,140,0.8)]' 
                : 'bg-black/60 border-white/40 group-hover/pin:border-white shadow-xl'
              }
            `}>
              <div className={`w-1.5 h-1.5 rounded-full ${selectedProduct?.id === product.id ? 'bg-white' : 'bg-secondary animate-pulse'}`} />
            </div>

            {/* Floating Tooltip Label */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover/pin:opacity-100 transition-all translate-y-2 group-hover/pin:translate-y-0 pointer-events-none">
                <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-white whitespace-nowrap uppercase tracking-widest shadow-2xl">
                    {product.name}
                </div>
            </div>
          </button>
        );
      })}

      {/* Floating Product Card */}
      <div 
        className={`
          absolute bottom-8 right-8 w-80 glass-panel p-6 rounded-[2.5rem] border border-white/20 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] 
          transition-all duration-500 pointer-events-auto
          ${selectedProduct 
            ? 'translate-y-0 opacity-100 scale-100' 
            : 'translate-y-12 opacity-0 scale-90 pointer-events-none'
          }
        `}
      >
        {selectedProduct && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex justify-between items-start">
               <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-secondary/20 text-secondary">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Product Detail</span>
                    <h4 className="text-lg font-display font-bold text-white leading-tight mt-0.5">{selectedProduct.name}</h4>
                  </div>
               </div>
               <button 
                 onClick={() => setSelectedProduct(null)}
                 className="p-1.5 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors"
               >
                 <X size={18} />
               </button>
            </div>

            <div className="space-y-3">
               <div className="flex items-center justify-between text-xs">
                  <span className="text-accent/40 font-bold uppercase tracking-widest">Category</span>
                  <span className="text-white font-medium">{selectedProduct.category}</span>
               </div>
               {selectedProduct.priceRange && (
                 <div className="flex items-center justify-between text-xs">
                    <span className="text-accent/40 font-bold uppercase tracking-widest">Est. Price</span>
                    <span className="text-secondary font-mono font-bold">{selectedProduct.priceRange}</span>
                 </div>
               )}
            </div>

            <div className="pt-2 flex flex-col gap-2">
                <a 
                  href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(selectedProduct.query)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-4 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-secondary hover:text-white transition-all shadow-xl shadow-white/5 group/btn"
                >
                  <Search size={14} />
                  Shop this Look
                  <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                </a>
                
                <div className="grid grid-cols-2 gap-2">
                    <a 
                      href={`https://www.amazon.com/s?k=${encodeURIComponent(selectedProduct.query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="py-3 rounded-xl bg-white/5 border border-white/5 text-[9px] font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-all text-center flex items-center justify-center gap-2"
                    >
                       <ShoppingCart size={12} />
                       Amazon
                    </a>
                    <a 
                      href={`https://www.ikea.com/us/en/search/products/?q=${encodeURIComponent(selectedProduct.category + " " + selectedProduct.query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="py-3 rounded-xl bg-white/5 border border-white/5 text-[9px] font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-all text-center flex items-center justify-center gap-2"
                    >
                       <ExternalLink size={12} />
                       IKEA
                    </a>
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductVisualDiscovery;
