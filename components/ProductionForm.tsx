import React, { useState, useEffect, useMemo } from 'react';
import { Package, Truck, Trash2, CheckCircle, Loader2, Scale } from 'lucide-react';
import { PRODUCTS } from '../constants';
import { GlassCard } from './ui/GlassCard';
import { Product, ProductionLogEntry } from '../types';

interface ProductionFormProps {
  onSubmit: (entry: Omit<ProductionLogEntry, 'id' | 'timestamp' | 'batchId'>) => void;
}

const ProductionForm: React.FC<ProductionFormProps> = ({ onSubmit }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product>(PRODUCTS[0]);
  
  // Form State
  const [palletCount, setPalletCount] = useState<string>('');
  const [palletWeight, setPalletWeight] = useState<string>(PRODUCTS[0].defaultPalletWeight.toString());
  
  const [bagCount, setBagCount] = useState<string>('');
  const [bagWeight, setBagWeight] = useState<string>(PRODUCTS[0].defaultBagWeight.toString());
  
  const [looseKg, setLooseKg] = useState<string>('');
  
  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Update defaults when product changes
  useEffect(() => {
    setPalletWeight(selectedProduct.defaultPalletWeight.toString());
    setBagWeight(selectedProduct.defaultBagWeight.toString());
  }, [selectedProduct]);

  // Calculations
  const calcPallets = useMemo(() => {
    const c = parseFloat(palletCount) || 0;
    const w = parseFloat(palletWeight) || 0;
    return c * w;
  }, [palletCount, palletWeight]);

  const calcBags = useMemo(() => {
    const c = parseFloat(bagCount) || 0;
    const w = parseFloat(bagWeight) || 0;
    return c * w;
  }, [bagCount, bagWeight]);

  const calcLoose = useMemo(() => parseFloat(looseKg) || 0, [looseKg]);

  const grandTotal = calcPallets + calcBags + calcLoose;
  const isValid = grandTotal > 0;

  const handleSubmit = () => {
    if (!isValid) return;

    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);
      
      const entryData = {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        palletsCount: parseFloat(palletCount) || 0,
        palletUnitWeight: parseFloat(palletWeight) || 0,
        bigBagsCount: parseFloat(bagCount) || 0,
        bigBagUnitWeight: parseFloat(bagWeight) || 0,
        looseKg: calcLoose,
        totalKg: grandTotal,
      };

      console.log("SUBMITTING BATCH:", entryData);
      onSubmit(entryData);

      // Reset Form after delay
      setTimeout(() => {
        setShowSuccess(false);
        setPalletCount('');
        setBagCount('');
        setLooseKg('');
      }, 1500);
    }, 1000);
  };

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

  // Reusable Input Component for consistent styling
  const GlassInput = ({ 
    label, 
    value, 
    onChange, 
    placeholder,
    type = "number" 
  }: { 
    label: string, 
    value: string, 
    onChange: (val: string) => void, 
    placeholder?: string,
    type?: string
  }) => (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs uppercase tracking-wider text-slate-500 font-bold pl-1">{label}</label>
      <input
        type={type}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          w-full bg-white border border-slate-300 rounded-xl px-4 py-3
          text-lg text-slate-900 placeholder-slate-400
          focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500
          transition-all shadow-sm
        "
      />
    </div>
  );

  return (
    <div className="w-full h-full relative flex flex-col gap-6 animate-fade-in pb-24 md:pb-0">
      
      {/* Success Overlay */}
      {showSuccess && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm rounded-3xl animate-fade-in">
          <CheckCircle size={80} className="text-emerald-500 mb-4 drop-shadow-sm" />
          <h2 className="text-3xl font-bold text-slate-800 tracking-wide">Batch Logged</h2>
        </div>
      )}

      {/* Product Selector */}
      <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
        <div className="flex gap-3 min-w-max">
          {PRODUCTS.map((prod) => (
            <button
              key={prod.id}
              onClick={() => setSelectedProduct(prod)}
              className={`
                relative px-6 py-3 rounded-xl font-medium transition-all duration-300 flex flex-col items-start min-w-[140px]
                ${selectedProduct.id === prod.id 
                  ? 'bg-blue-600 shadow-md ring-2 ring-blue-300 border-blue-600 text-white translate-y-[-2px]' 
                  : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
              `}
            >
              <span className="text-lg font-bold">{prod.name}</span>
              <span className={`text-xs mt-1 ${selectedProduct.id === prod.id ? 'text-blue-100' : 'text-slate-400'}`}>
                {prod.details}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Calculator Rows */}
      <div className="flex flex-col gap-4">
        
        {/* ROW 1: Pallets */}
        <GlassCard className="p-4 md:p-5 flex flex-col md:flex-row items-center gap-4 md:gap-6">
          <div className="p-3 bg-indigo-50 rounded-full text-indigo-600 border border-indigo-100">
            <Package size={28} />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            <GlassInput 
              label="Pallet Count" 
              value={palletCount} 
              onChange={setPalletCount} 
              placeholder="0" 
            />
            <GlassInput 
              label="Unit Weight (kg)" 
              value={palletWeight} 
              onChange={setPalletWeight} 
            />
          </div>
          <div className="w-full md:w-32 text-right md:text-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-bold">Subtotal</div>
            <div className="text-2xl font-bold text-slate-800 font-mono">{formatNumber(calcPallets)}</div>
          </div>
        </GlassCard>

        {/* ROW 2: Big Bags */}
        <GlassCard className="p-4 md:p-5 flex flex-col md:flex-row items-center gap-4 md:gap-6">
          <div className="p-3 bg-emerald-50 rounded-full text-emerald-600 border border-emerald-100">
            <Truck size={28} />
          </div>
          <div className="flex-1 grid grid-cols-2 gap-4 w-full">
            <GlassInput 
              label="Big Bags" 
              value={bagCount} 
              onChange={setBagCount} 
              placeholder="0"
            />
            <GlassInput 
              label="Unit Weight (kg)" 
              value={bagWeight} 
              onChange={setBagWeight} 
            />
          </div>
          <div className="w-full md:w-32 text-right md:text-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-bold">Subtotal</div>
            <div className="text-2xl font-bold text-slate-800 font-mono">{formatNumber(calcBags)}</div>
          </div>
        </GlassCard>

        {/* ROW 3: Loose / Sweepings */}
        <GlassCard className="p-4 md:p-5 flex flex-col md:flex-row items-center gap-4 md:gap-6">
          <div className="p-3 bg-amber-50 rounded-full text-amber-600 border border-amber-100">
            <Trash2 size={28} />
          </div>
          <div className="flex-1 w-full">
            <GlassInput 
              label="Loose / Sweepings (Total Kg)" 
              value={looseKg} 
              onChange={setLooseKg}
              placeholder="0"
            />
          </div>
          <div className="w-full md:w-32 text-right md:text-center pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1 font-bold">Subtotal</div>
            <div className="text-2xl font-bold text-slate-800 font-mono">{formatNumber(calcLoose)}</div>
          </div>
        </GlassCard>
      </div>

      {/* Footer / Grand Total */}
      <GlassCard className="mt-2 p-6 bg-slate-900 border-slate-800 text-white">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <div className="text-sm text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2 font-bold">
              <Scale size={16} /> Total Batch Weight
            </div>
            <div className="text-4xl md:text-5xl font-bold text-white font-mono tracking-tight">
              {formatNumber(grandTotal)} <span className="text-2xl text-slate-500">kg</span>
            </div>
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={`
              w-full md:w-auto px-10 py-4 rounded-xl font-bold text-lg tracking-wide uppercase
              transition-all duration-300 flex items-center justify-center gap-3 shadow-lg
              ${isValid 
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30 hover:shadow-blue-500/40 hover:-translate-y-1' 
                : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'}
            `}
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : 'Submit Batch'}
          </button>
        </div>
      </GlassCard>
    </div>
  );
};

export default ProductionForm;