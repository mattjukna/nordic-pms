
import React, { useState } from 'react';
import { LayoutGrid, X, Plus, Trash2 } from 'lucide-react';

interface PackagingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (str: string) => void;
  defaultPallet: number;
  defaultBag: number;
}

export const PackagingWizard: React.FC<PackagingWizardProps> = ({ isOpen, onClose, onApply, defaultPallet, defaultBag }) => {
  const [lines, setLines] = useState<{ count: string; type: 'pad' | 'bb' | 'tank'; weight: string }[]>([
    { count: '', type: 'pad', weight: defaultPallet.toString() }
  ]);

  const addLine = () => setLines([...lines, { count: '', type: 'pad', weight: defaultPallet.toString() }]);
  const removeLine = (idx: number) => setLines(lines.filter((_, i) => i !== idx));
  
  const updateLine = (idx: number, field: keyof typeof lines[0], val: string) => {
     const newLines = [...lines];
     newLines[idx] = { ...newLines[idx], [field]: val };
     if (field === 'type') {
        if (val === 'pad') newLines[idx].weight = defaultPallet.toString();
        else if (val === 'bb') newLines[idx].weight = defaultBag.toString();
        else if (val === 'tank') newLines[idx].weight = '25000';
     }
     setLines(newLines);
  };

  const calculateString = () => {
    return lines
      .filter(l => l.count && parseFloat(l.count) > 0)
      .map(l => `${l.count} ${l.type} *${l.weight}`)
      .join('; ');
  };

  const handleApply = () => {
    onApply(calculateString());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
       <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-slate-900/10">
          <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
             <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><LayoutGrid size={16}/> Packaging Builder</h3>
             <button onClick={onClose}><X size={16} className="text-slate-400 hover:text-red-500"/></button>
          </div>
          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
             {lines.map((line, idx) => (
               <div key={idx} className="flex gap-2 items-end">
                  <div className="w-16">
                     <label className="text-[10px] font-bold text-slate-400 uppercase">Count</label>
                     <input type="number" className="w-full bg-white text-slate-900 border border-slate-300 rounded p-1.5 text-sm" value={line.count} onChange={e => updateLine(idx, 'count', e.target.value)} />
                  </div>
                  <div className="w-24">
                     <label className="text-[10px] font-bold text-slate-400 uppercase">Type</label>
                     <select className="w-full bg-white text-slate-900 border border-slate-300 rounded p-1.5 text-sm" value={line.type} onChange={e => updateLine(idx, 'type', e.target.value as any)}>
                        <option value="pad">Pallet</option>
                        <option value="bb">Big Bag</option>
                        <option value="tank">Tank</option>
                     </select>
                  </div>
                  <div className="flex-1">
                     <label className="text-[10px] font-bold text-slate-400 uppercase">Unit Wgt (kg)</label>
                     <input type="number" className="w-full bg-white text-slate-900 border border-slate-300 rounded p-1.5 text-sm" value={line.weight} onChange={e => updateLine(idx, 'weight', e.target.value)} />
                  </div>
                  <button onClick={() => removeLine(idx)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
               </div>
             ))}
             <button onClick={addLine} className="text-xs text-blue-600 font-bold flex items-center gap-1 hover:underline mt-2">
                <Plus size={12}/> Add Line
             </button>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
             <div className="text-xs text-slate-500 font-mono">
                {calculateString() || "Empty"}
             </div>
             <button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm">
                Apply to Batch
             </button>
          </div>
       </div>
    </div>
  );
};
