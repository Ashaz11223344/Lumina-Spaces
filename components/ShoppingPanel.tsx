import React from 'react';
import { ProductItem } from '../types';
import { ShoppingBag, Search, ExternalLink, ShoppingCart } from 'lucide-react';

interface ShoppingPanelProps {
  items: ProductItem[];
  isLoading: boolean;
}

const ShoppingPanel: React.FC<ShoppingPanelProps> = ({ items, isLoading }) => {
  if (!isLoading && items.length === 0) return null;

  return (
    <div className="mt-8 glass-panel rounded-[2rem] p-8 border border-white/10 animate-fade-in relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex items-center gap-3 mb-8 relative z-10">
        <div className="p-3 rounded-xl bg-gradient-to-br from-tertiary to-primary shadow-lg shadow-primary/20">
           <ShoppingBag size={20} className="text-white" />
        </div>
        <div>
          <h3 className="text-2xl font-display font-bold text-white">Shop The Look</h3>
          <p className="text-sm text-slate-400">Exact product matches found for your new design</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-white/5 animate-pulse border border-white/5 flex flex-col justify-end p-4">
               <div className="w-1/2 h-4 bg-white/10 rounded mb-2"></div>
               <div className="w-3/4 h-3 bg-white/5 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 relative z-10">
          {items.map((item) => (
            <div 
              key={item.id} 
              className="group bg-black/40 backdrop-blur-sm rounded-2xl p-6 border border-white/5 hover:border-primary/50 transition-all hover:bg-white/5 flex flex-col justify-between"
            >
              <div className="mb-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase tracking-wider text-white/50 border border-white/5 font-medium">
                    {item.category}
                  </span>
                  {item.priceRange && (
                     <span className="text-xs text-secondary font-mono bg-secondary/10 px-2 py-0.5 rounded">{item.priceRange}</span>
                  )}
                </div>
                <h4 className="font-bold text-white mb-2 group-hover:text-primary transition-colors text-lg leading-tight">
                  {item.name}
                </h4>
                <div className="p-3 bg-black/30 rounded-xl mb-2 border border-white/5">
                   <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Search Keywords</p>
                   <p className="text-xs text-slate-300 font-mono leading-relaxed line-clamp-3">
                     {item.query}
                   </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-auto">
                 {/* Google - Primary */}
                 <a 
                   href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.query)}`}
                   target="_blank"
                   rel="noreferrer"
                   className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-black hover:bg-primary hover:text-white text-xs font-bold uppercase tracking-wide transition-all shadow-lg shadow-white/5"
                 >
                   <Search size={14} />
                   Find on Google
                 </a>
                 
                 {/* Retailer Grid */}
                 <div className="grid grid-cols-4 gap-2 mt-1">
                    <RetailerLink 
                        url={`https://www.amazon.com/s?k=${encodeURIComponent(item.query)}`} 
                        name="Amazon" 
                        color="hover:bg-[#FF9900] hover:text-black"
                    />
                    <RetailerLink 
                        url={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.query)}`} 
                        name="eBay" 
                        color="hover:bg-[#E53238] hover:text-white"
                    />
                    <RetailerLink 
                        url={`https://www.ikea.com/us/en/search/products/?q=${encodeURIComponent(item.category + " " + item.query)}`} 
                        name="IKEA" 
                        color="hover:bg-[#0058a3] hover:text-[#ffdb00]"
                    />
                    <RetailerLink 
                        url={`https://www.flipkart.com/search?q=${encodeURIComponent(item.query)}`} 
                        name="Flipkart" 
                        color="hover:bg-[#2874f0] hover:text-white"
                    />
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper for mini buttons
const RetailerLink: React.FC<{ url: string; name: string; color: string }> = ({ url, name, color }) => (
    <a 
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`
        aspect-square flex flex-col items-center justify-center rounded-xl bg-white/5 text-slate-400 border border-white/5 transition-all
        ${color}
      `}
      title={`Search on ${name}`}
    >
        <ExternalLink size={14} className="mb-1" />
        <span className="text-[8px] font-bold uppercase tracking-tight">{name.slice(0,4)}</span>
    </a>
);

export default ShoppingPanel;