import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/20/solid';

const hasRenderableValue = (value) => value !== undefined && value !== null && value !== '';

export const getProductFeatureValue = (product, featureKey) => {
  const specValue = product.spec?.[featureKey];
  if (hasRenderableValue(specValue)) {
    return specValue;
  }

  if (Object.prototype.hasOwnProperty.call(product, featureKey)) {
    const productValue = product[featureKey];
    return hasRenderableValue(productValue) ? productValue : 'Unlimited';
  }

  return null;
};

/**
 * FeatureComparison matrix for Products page
 */
const FeatureComparison = ({ products, features }) => {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="p-6 bg-slate-50/50 border-b border-slate-200 min-w-[240px]">
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Compare Features</span>
              </th>
              {products.map(product => (
                <th key={product.id} className="p-6 bg-slate-50/50 border-b border-slate-200 text-center min-w-[180px]">
                  <div className="flex flex-col items-center">
                    <span className="text-lg font-bold text-slate-900">{product.name}</span>
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-tighter mt-1">{product.tier}</span>
                    {product.is_featured && (
                      <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 text-primary-700 uppercase">
                        Most Popular
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {features.map(feature => (
              <tr key={feature.key} className="hover:bg-slate-50/80 transition-colors">
                <td className="p-6">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{feature.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{feature.description}</p>
                  </div>
                </td>
                {products.map(product => {
                  const hasFeature = product.features?.includes(feature.name) || product.features?.includes(feature.key);
                  const featureValue = getProductFeatureValue(product, feature.key);
                  
                  return (
                    <td key={product.id} className="p-6 text-center">
                      {featureValue !== null ? (
                        <span className="text-sm font-bold text-slate-900">{featureValue}</span>
                      ) : hasFeature ? (
                        <div className="flex justify-center">
                          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                            <CheckIcon className="h-4 w-4" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                            <XMarkIcon className="h-4 w-4" />
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FeatureComparison;
