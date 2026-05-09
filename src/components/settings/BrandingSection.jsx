import React, { useState, useEffect } from 'react';
import { getCompanyProfile, updateCompanyProfile } from '../../services/settingsService';
import { useToast } from '../ToastProvider';
import { 
  BuildingOfficeIcon, 
  GlobeAltIcon, 
  EnvelopeIcon, 
  PhoneIcon,
  MapPinIcon,
  PhotoIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const BrandingSection = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadBranding();
  }, []);

  const loadBranding = async () => {
    try {
      setLoading(true);
      const data = await getCompanyProfile();
      setProfile(data);
    } catch (err) {
      toast.error('Failed to load branding settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await updateCompanyProfile(profile);
      toast.success('Branding updated successfully');
      // Trigger a page reload or event to update sidebar
      window.dispatchEvent(new Event('app-branding-updated'));
    } catch (err) {
      toast.error('Failed to save branding');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading branding settings...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <SparklesIcon className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Application Branding</h2>
            <p className="text-xs text-slate-500">Customize the look and feel of your PACS instance</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Application Title</label>
                <div className="relative">
                  <input
                    type="text"
                    value={profile.appTitle || ''}
                    onChange={(e) => setProfile({ ...profile, appTitle: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. My Hospital PACS"
                  />
                  <GlobeAltIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Short Title / Initial</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={3}
                    value={profile.shortTitle || ''}
                    onChange={(e) => setProfile({ ...profile, shortTitle: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="P"
                  />
                  <span className="absolute left-3 top-2.5 font-bold text-slate-400 text-sm">Abbr</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Shown when sidebar is collapsed</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Logo URL</label>
                <div className="relative">
                  <input
                    type="text"
                    value={profile.logoUrl || ''}
                    onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="https://..."
                  />
                  <PhotoIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Preview</p>
                <div className="flex items-center justify-center gap-4">
                  {/* Collapsed Preview */}
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {profile.logoUrl ? (
                      <img src={profile.logoUrl} alt="Logo" className="w-8 h-8 object-contain" onError={(e) => e.target.style.display='none'} />
                    ) : (profile.shortTitle || 'P')}
                  </div>
                  {/* Expanded Preview */}
                  <div className="h-10 px-4 bg-white border border-slate-200 rounded-xl flex items-center gap-2 shadow-sm">
                    <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center text-white font-bold text-xs">
                      {profile.shortTitle || 'P'}
                    </div>
                    <span className="font-bold text-slate-900 text-sm">{profile.appTitle || 'PACS UI'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Company Name</label>
              <div className="relative">
                <input
                  type="text"
                  value={profile.name || ''}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <BuildingOfficeIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Official Website</label>
              <div className="relative">
                <input
                  type="text"
                  value={profile.website || ''}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <GlobeAltIcon className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Apply Branding'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BrandingSection;
