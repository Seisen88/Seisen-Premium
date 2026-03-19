'use client';

import { useState, useEffect } from 'react';
import { Code, Search, Check, Copy, X, Crown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import TiltCard from '@/components/ui/TiltCard';
import Button from '@/components/ui/Button';
import { copyToClipboard } from '@/lib/utils';
import Image from 'next/image';

interface Script {
  id: string;
  name: string;
  scriptUrl: string;
  status: 'Working' | 'Discontinued';
  type: string;
  universeId?: string;
  displayType?: string;
  additionalUrls?: { url: string; type: string }[];
  description?: string;
  features?: string[];
}

interface ScriptsClientProps {
  initialScripts: Script[];
}

export default function ScriptsClient({ initialScripts }: ScriptsClientProps) {
  const [scripts, setScripts] = useState<Script[]>(initialScripts);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [detailsPosition, setDetailsPosition] = useState<'left' | 'right'>('right');
  const [clickedCardRect, setClickedCardRect] = useState<{top: number, left: number, width: number, height: number} | null>(null);
  
  // Generate random heights for each script card
  const getCardHeight = (scriptId: string) => {
    // Use script ID as seed for consistent random heights
    let hash = 0;
    for (let i = 0; i < scriptId.length; i++) {
      const char = scriptId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Generate height between 200px and 450px based on hash
    const minHeight = 200;
    const maxHeight = 450;
    const height = minHeight + (Math.abs(hash) % (maxHeight - minHeight));
    return height;
  };

  useEffect(() => {
    // Fetch thumbnails for games with universeId
    const fetchThumbnails = async () => {
      const universeIds = initialScripts
        .filter(s => s.universeId)
        .map(s => s.universeId)
        .join(',');
      
      if (!universeIds) return;

      // Processing in chunks to avoid URL length issues if many
      const chunks = initialScripts.reduce((acc, script) => {
        if (!script.universeId) return acc;
        if (acc.length === 0 || acc[acc.length - 1].length >= 100) {
          acc.push([script.universeId]);
        } else {
          acc[acc.length - 1].push(script.universeId);
        }
        return acc;
      }, [] as string[][]);

      for (const chunk of chunks) {
        try {
          const ids = chunk.join(',');
          const res = await fetch(`/api/proxy/thumbnails?universeIds=${ids}`);
          const data = await res.json();
          
          if (data.data) {
            setThumbnails(prev => {
              const newThumbs = { ...prev };
              data.data.forEach((item: any) => {
                newThumbs[item.targetId] = item.imageUrl;
              });
              return newThumbs;
            });
          }
        } catch (e) {
          console.error('Thumbnail fetch error:', e);
        }
      }
    };

    fetchThumbnails();
  }, [initialScripts]);

  // Click outside to close details panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedScript) {
        const target = event.target as Element;
        const detailsPanel = target.closest('[data-details-panel="true"]');
        const scriptCard = target.closest('[data-script-card="true"]');
        
        // Close if clicked outside both the details panel and script cards
        if (!detailsPanel && !scriptCard) {
          setSelectedScript(null);
        }
      }
    };

    if (selectedScript) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedScript]);

  // Click outside to close details panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectedScript) {
        const target = event.target as Element;
        const detailsPanel = target.closest('[data-details-panel="true"]');
        const scriptCard = target.closest('[data-script-card="true"]');
        
        // Close if clicked outside both the details panel and script cards
        if (!detailsPanel && !scriptCard) {
          setSelectedScript(null);
        }
      }
    };

    if (selectedScript) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedScript]);

  const handleScriptClick = (e: React.MouseEvent, script: Script) => {
    e.stopPropagation();
    const isCurrentlySelected = selectedScript?.id === script.id;
    const newSelectedScript = isCurrentlySelected ? null : script;
    
    if (newSelectedScript) {
      // Get the card element to check its position
      const cardElement = document.getElementById(`script-card-${script.id}`);
      if (cardElement) {
        const cardRect = cardElement.getBoundingClientRect();
        // Store rect relative to viewport, we'll add scrollY when rendering absolute
        setClickedCardRect({
            top: cardRect.top,
            left: cardRect.left,
            width: cardRect.width,
            height: cardRect.height
        });

        const viewportWidth = window.innerWidth;
        
        // Check if there's enough space on the right (420px for details + 24px margin)
        const spaceOnRight = viewportWidth - (cardRect.right + 24);
        const detailsWidth = 420;
        
        // Position on left if not enough space on right
        setDetailsPosition(spaceOnRight < detailsWidth ? 'left' : 'right');
      }
    } else {
        setClickedCardRect(null);
    }
    
    setSelectedScript(newSelectedScript);
  };

  const filteredScripts = scripts.filter((script) => {
    const matchesSearch =
      script.name.toLowerCase().includes(searchQuery.toLowerCase());

    const isPremium = script.type.toLowerCase().includes('premium') || script.displayType?.toLowerCase().includes('premium');
    
    // Logic: Free filter shows Free-only and Free/Premium. Premium filter shows Premium-only and Free/Premium.
    const matchesFilter =
      filter === 'all' ||
      (filter === 'free' && (script.type === 'Free' || script.displayType === 'Free & Premium')) ||
      (filter === 'premium' && (script.type === 'Premium' || script.displayType === 'Free & Premium'));

    return matchesSearch && matchesFilter;
  });

  const handleCopy = async (e: React.MouseEvent, script: Script) => {
    e.stopPropagation();
    const textToCopy = `loadstring(game:HttpGet("https://api.junkie-development.de/api/v1/luascripts/public/8ac2e97282ac0718aeeb3bb3856a2821d71dc9e57553690ab508ebdb0d1569da/download"))()`;
    
    const success = await copyToClipboard(textToCopy);
    if (success) {
      setCopiedId(script.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 md:px-8 relative">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <section className="text-center animate-fade-in">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/30">
            <Code className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Script Hub</h1>
          <p className="text-gray-500">
            Browse our collection of {initialScripts.length} premium and free scripts
          </p>
        </section>

        {/* Search and Filters */}
        <section className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#141414] border border-[#2a2a2a] rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-[rgba(var(--accent-rgb),0.5)] transition-colors"
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'free', 'premium'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={filter === f ? {
                  backgroundColor: 'rgba(var(--accent-rgb), 0.1)',
                  borderColor: 'rgba(var(--accent-rgb), 0.5)',
                  color: 'var(--accent)'
                } : undefined}
                className={`px-4 py-2.5 rounded-lg border transition-all capitalize ${
                  filter === f
                    ? ''
                    : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-[#3a3a3a]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </section>

        {/* Scripts Masonry Grid */}
        <section className="relative">
          <div 
            className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-6 space-y-6"
          >
            {filteredScripts.map((script, index) => {
              const isSelected = selectedScript?.id === script.id;

              return (
                <div 
                  key={script.id} 
                  className="relative mb-6 break-inside-avoid" 
                  id={`script-card-${script.id}`}
                  data-script-card="true"
                >
                  <TiltCard>
                    <Card
                      variant="hover"
                      className={`group relative overflow-hidden cursor-pointer transition-all ${
                        isSelected ? 'z-50' : selectedScript ? 'blur-sm opacity-60' : ''
                      }`}
                      onClick={(e) => handleScriptClick(e, script)}
                      style={{
                        height: `${getCardHeight(script.id)}px`,
                        ...(script.status === 'Discontinued' ? {
                          backgroundColor: 'rgb(69 10 10 / 0.3)',
                          border: isSelected ? '2px solid rgb(239 68 68 / 0.8)' : '1px solid rgb(239 68 68 / 0.4)',
                          boxShadow: isSelected ? '0 0 0 2px rgb(239 68 68 / 0.4), 0 0 20px rgb(239 68 68 / 0.2)' : '0 0 20px rgb(239 68 68 / 0.1)',
                        } : {
                          ...(isSelected ? { outline: '2px solid var(--accent)', outlineOffset: '0px' } : {})
                        })
                      }}
                    >
                      {/* Full Image Background */}
                      {script.universeId && thumbnails[script.universeId] ? (
                        <Image
                          src={thumbnails[script.universeId]}
                          alt={script.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
                          <Code className="w-16 h-16 text-[#333]" />
                        </div>
                      )}

                      {/* Overlay Gradient */}
                      <div className={`absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent ${script.status === 'Discontinued' ? 'opacity-80' : ''}`} />

                      {/* Discontinued Banner */}
                      {script.status === 'Discontinued' && (
                        <div className="absolute top-3 left-0 right-0 flex justify-center z-30">
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40 backdrop-blur-sm">
                            Discontinued
                          </span>
                        </div>
                      )}

                      {/* Name Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                        <div className="flex items-center gap-2 mb-1">
                          {script.status === 'Working' ? (
                            <div className="relative flex-shrink-0">
                              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
                              <div className="absolute inset-0 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                            </div>
                          ) : (
                            <div className="relative flex-shrink-0">
                              <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                              <div className="absolute inset-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75"></div>
                            </div>
                          )}
                          <h3 className="text-xl font-bold text-white drop-shadow-md">
                            {script.name}
                          </h3>
                        </div>
                        {/* Floating Action Button (Quick Copy) */}
                        {script.status !== 'Discontinued' && (
                          <button
                            onClick={(e) => handleCopy(e, script)}
                            className="absolute bottom-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
                            title="Quick Copy Loader"
                          >
                            {copiedId === script.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </Card>
                  </TiltCard>

                </div>
              );
            })}
          </div>
        </section>

        {/* Global Details Panels (Rendered outside grid to prevent layout shift) */}
        {selectedScript && (
            <>
                {/* Desktop Details Panel */}
                <div 
                    className="absolute w-[420px] rounded-3xl shadow-2xl overflow-hidden z-[100] animate-in duration-300 hidden lg:block"
                    data-details-panel="true"
                    style={{ 
                        background: `linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%)`,
                        borderColor: selectedScript.status === 'Discontinued' ? 'rgb(239 68 68 / 0.6)' : 'var(--accent)',
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        maxHeight: '750px',
                        height: '750px',
                        top: clickedCardRect ? (clickedCardRect.top + (typeof window !== 'undefined' ? window.scrollY : 0)) : 0,
                        left: clickedCardRect ? (detailsPosition === 'right' ? (clickedCardRect.left + clickedCardRect.width + 24) : (clickedCardRect.left - 420 - 24)) : 0,
                    }}
                >
                      {/* Decorative gradient overlay */}
                      <div 
                        className="absolute inset-0 pointer-events-none opacity-20"
                        style={{
                          background: selectedScript.status === 'Discontinued'
                            ? `radial-gradient(circle at top right, rgb(239 68 68), transparent 60%)`
                            : `radial-gradient(circle at top right, var(--accent), transparent 60%)`
                        }}
                      ></div>

                      {/* Close Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedScript(null);
                        }}
                        className="absolute top-6 right-6 p-2.5 rounded-xl bg-black/20 hover:bg-black/30 text-white/80 hover:text-white transition-all backdrop-blur-sm shadow-lg z-[110]"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      
                      <div className={`relative p-8 h-full overflow-y-auto ${selectedScript.status === 'Discontinued' ? 'discontinued-scrollbar' : 'custom-scrollbar'}`}>

                        {/* Mini Card Preview with Glow */}
                        <div className="mb-8 relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent blur-2xl"></div>
                          <div className="relative aspect-square w-44 mx-auto rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/20">
                            {selectedScript.universeId && thumbnails[selectedScript.universeId] ? (
                              <Image
                                src={thumbnails[selectedScript.universeId]}
                                alt={selectedScript.name}
                                fill
                                className="object-contain"
                                />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-black/30 to-black/50">
                                <Code className="w-12 h-12 text-white/40" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                          </div>
                        </div>

                        {/* Type Badge with Gradient */}
                        <div className="mb-8 text-center">
                          <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold backdrop-blur-md shadow-xl ${
                            selectedScript.status === 'Discontinued'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : 'bg-gradient-to-r from-black/30 to-black/20 text-white border border-white/20'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${selectedScript.status === 'Discontinued' ? 'bg-red-400' : 'bg-white/60'}`}></div>
                            {selectedScript.displayType || selectedScript.type}
                          </span>
                        </div>

                        {/* Description with Glass Effect */}
                        <div className="mb-6 backdrop-blur-md bg-white/10 rounded-2xl p-6 border border-white/20 shadow-xl">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-1.5 h-8 bg-gradient-to-b from-white/80 to-white/40 rounded-full shadow-lg"></div>
                            <h3 className="text-lg font-bold text-white">Description</h3>
                          </div>
                          <p className="text-white/90 leading-relaxed text-sm">
                            {selectedScript.description || "No description available for this script. Verified and tested by the Seisen Team."}
                          </p>
                        </div>

                        {/* Features with Glass Effect */}
                        <div className="mb-8 backdrop-blur-md bg-white/10 rounded-2xl p-6 border border-white/20 shadow-xl">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="w-1.5 h-8 bg-gradient-to-b from-white/80 to-white/40 rounded-full shadow-lg"></div>
                            <h3 className="text-lg font-bold text-white">Features</h3>
                          </div>
                          {selectedScript.features && selectedScript.features.length > 0 ? (
                            <ul className="space-y-3">
                              {selectedScript.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-3 text-white/90 text-sm group">
                                  <div className="mt-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-white/30 to-white/10 flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform">
                                    <Check className="w-3 h-3 text-white" />
                                  </div>
                                  <span className="flex-1">{feature}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-white/60 italic text-sm">
                              Features list not available.
                            </div>
                          )}
                        </div>

                        {/* Action Button with Gradient */}
                        {selectedScript.status !== 'Discontinued' && (
                          <>
                            {selectedScript.type === 'Premium' && selectedScript.displayType !== 'Free & Premium' ? (
                              <Button className="w-full justify-center h-12 text-base font-bold bg-gradient-to-r from-black via-black/90 to-black text-white hover:from-black/90 hover:via-black/80 hover:to-black/90 shadow-2xl border border-white/20 backdrop-blur-sm" onClick={() => window.location.href = '/premium'}>
                                <Crown className="w-5 h-5 mr-2" />
                                Get Premium Access
                              </Button>
                            ) : (
                              <Button 
                                className={`w-full justify-center h-12 text-base font-bold transition-all shadow-2xl border border-white/20 backdrop-blur-sm ${
                                  copiedId === selectedScript.id 
                                    ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600' 
                                    : 'bg-gradient-to-r from-black via-black/90 to-black hover:from-black/90 hover:via-black/80 hover:to-black/90'
                                } text-white`}
                                onClick={(e) => handleCopy(e, selectedScript)}
                              >
                                {copiedId === selectedScript.id ? (
                                  <>
                                    <Check className="w-5 h-5 mr-2" />
                                    Copied Successfully!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-5 h-5 mr-2" />
                                    Copy Loader Script
                                  </>
                                )}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Mobile Details Panel - Centered overlay */}
                    <div 
                      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] max-w-[90vw] rounded-3xl shadow-2xl overflow-hidden z-[100] animate-in duration-300 lg:hidden"
                      data-details-panel="true"
                      style={{ 
                        background: `linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%)`,
                        borderColor: selectedScript.status === 'Discontinued' ? 'rgb(239 68 68 / 0.6)' : 'var(--accent)',
                        borderWidth: '2px',
                        borderStyle: 'solid',
                        maxHeight: '90vh',
                        height: 'auto'
                      }}
                    >
                      {/* Decorative gradient overlay */}
                      <div 
                        className="absolute inset-0 pointer-events-none opacity-20"
                        style={{
                          background: selectedScript.status === 'Discontinued'
                            ? `radial-gradient(circle at top right, rgb(239 68 68), transparent 60%)`
                            : `radial-gradient(circle at top right, var(--accent), transparent 60%)`
                        }}
                      ></div>

                      {/* Close Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedScript(null);
                        }}
                        className="absolute top-4 right-4 p-2.5 rounded-xl bg-black/20 hover:bg-black/30 text-white/80 hover:text-white transition-all backdrop-blur-sm shadow-lg z-[110]"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      
                      <div className={`relative p-6 h-full overflow-y-auto ${selectedScript.status === 'Discontinued' ? 'discontinued-scrollbar' : 'custom-scrollbar'}`}>

                        {/* Mini Card Preview with Glow */}
                        <div className="mb-6 relative">
                          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent blur-2xl"></div>
                          <div className="relative aspect-square w-32 mx-auto rounded-2xl overflow-hidden shadow-2xl ring-4 ring-white/20">
                            {selectedScript.universeId && thumbnails[selectedScript.universeId] ? (
                              <Image
                                src={thumbnails[selectedScript.universeId]}
                                alt={selectedScript.name}
                                fill
                                className="object-contain"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-black/30 to-black/50">
                                <Code className="w-10 h-10 text-white/40" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          </div>
                        </div>

                        {/* Type Badge with Gradient */}
                        <div className="mb-6 text-center">
                          <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md shadow-xl ${
                            selectedScript.status === 'Discontinued'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : 'bg-gradient-to-r from-black/30 to-black/20 text-white border border-white/20'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${selectedScript.status === 'Discontinued' ? 'bg-red-400' : 'bg-white/60'}`}></div>
                            {selectedScript.displayType || selectedScript.type}
                          </span>
                        </div>

                        {/* Description with Glass Effect */}
                        <div className="mb-4 backdrop-blur-md bg-white/10 rounded-2xl p-4 border border-white/20 shadow-xl">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-1.5 h-6 bg-gradient-to-b from-white/80 to-white/40 rounded-full shadow-lg"></div>
                            <h3 className="text-base font-bold text-white">Description</h3>
                          </div>
                          <p className="text-white/90 leading-relaxed text-sm">
                            {selectedScript.description || "No description available for this script. Verified and tested by the Seisen Team."}
                          </p>
                        </div>

                        {/* Features with Glass Effect */}
                        <div className="mb-6 backdrop-blur-md bg-white/10 rounded-2xl p-4 border border-white/20 shadow-xl">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-1.5 h-6 bg-gradient-to-b from-white/80 to-white/40 rounded-full shadow-lg"></div>
                            <h3 className="text-base font-bold text-white">Features</h3>
                          </div>
                          {selectedScript.features && selectedScript.features.length > 0 ? (
                            <ul className="space-y-2">
                              {selectedScript.features.map((feature, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-white/90 text-sm group">
                                  <div className="mt-0.5 w-4 h-4 rounded-full bg-gradient-to-br from-white/30 to-white/10 flex items-center justify-center flex-shrink-0 shadow-lg">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                  <span className="flex-1">{feature}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-white/60 italic text-sm">
                              Features list not available.
                            </div>
                          )}
                        </div>

                        {/* Action Button with Gradient */}
                        {selectedScript.status !== 'Discontinued' && (
                          <>
                            {selectedScript.type === 'Premium' && selectedScript.displayType !== 'Free & Premium' ? (
                              <Button className="w-full justify-center h-10 text-sm font-bold bg-gradient-to-r from-black via-black/90 to-black text-white hover:from-black/90 hover:via-black/80 hover:to-black/90 shadow-2xl border border-white/20 backdrop-blur-sm" onClick={() => window.location.href = '/premium'}>
                                <Crown className="w-4 h-4 mr-2" />
                                Get Premium Access
                              </Button>
                            ) : (
                              <Button 
                                className={`w-full justify-center h-10 text-sm font-bold transition-all shadow-2xl border border-white/20 backdrop-blur-sm ${
                                  copiedId === selectedScript.id 
                                    ? 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600' 
                                    : 'bg-gradient-to-r from-black via-black/90 to-black hover:from-black/90 hover:via-black/80 hover:to-black/90'
                                } text-white`}
                                onClick={(e) => handleCopy(e, selectedScript)}
                              >
                                {copiedId === selectedScript.id ? (
                                  <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy Script
                                  </>
                                )}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
            </>
        )}

        {filteredScripts.length === 0 && (
          <div className="text-center py-20 bg-[#101010] rounded-xl border border-[#1f1f1f]">
            <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No scripts found</h3>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
