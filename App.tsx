
import React, { useState, useRef, useEffect } from 'react';
import { 
  generateInitialScript, 
  generateAssets, 
  decodePCMToAudioBuffer, 
  regenerateAudio, 
  generateSingleImage 
} from './services/geminiService';
import { GeneratedContent, ShortsScript } from './types';

type AppState = 'idle' | 'scripting' | 'editing' | 'generating_assets' | 'completed';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>('idle');
  const [topic, setTopic] = useState("겨울철 별미");
  const [imageCount, setImageCount] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [visualStyle, setVisualStyle] = useState("Cinematic Photography");
  
  const [editableScript, setEditableScript] = useState<ShortsScript | null>(null);
  const [finalContent, setFinalContent] = useState<GeneratedContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [imageLoadingIndices, setImageLoadingIndices] = useState<Set<number>>(new Set());
  
  // Video Preview State
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [currentSubtitle, setCurrentSubtitle] = useState("");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handleStartScripting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setState('scripting');
    setError(null);
    try {
      const script = await generateInitialScript(topic, imageCount);
      setEditableScript(script);
      setState('editing');
    } catch (err) {
      setError("대본 생성 중 오류가 발생했습니다.");
      setState('idle');
    }
  };

  const handleGenerateFinal = async () => {
    if (!editableScript) return;
    setState('generating_assets');
    setError(null);
    try {
      const assets = await generateAssets(editableScript, aspectRatio, visualStyle);
      setFinalContent({ 
        script: { ...editableScript }, 
        images: assets.images, 
        audio: assets.audio,
        aspectRatio: aspectRatio
      });
      setState('completed');
    } catch (err) {
      setError("이미지 및 음성 생성 중 오류가 발생했습니다.");
      setState('editing');
    }
  };

  const handleRegenerateAudio = async () => {
    if (!finalContent) return;
    setIsAudioLoading(true);
    try {
      const newAudio = await regenerateAudio(finalContent.script);
      setFinalContent({ ...finalContent, audio: newAudio });
    } catch (err) {
      setError("음성 재녹음 중 오류가 발생했습니다.");
    } finally {
      setIsAudioLoading(false);
    }
  };

  const handleRegenerateImage = async (index: number) => {
    if (!finalContent) return;
    setImageLoadingIndices(prev => new Set(prev).add(index));
    try {
      const newPrompt = finalContent.script.imagePrompts[index];
      const newImageData = await generateSingleImage(newPrompt, aspectRatio, visualStyle);
      const newImages = [...finalContent.images];
      newImages[index] = newImageData;
      setFinalContent({ ...finalContent, images: newImages });
    } catch (err) {
      setError(`${index + 1}번 이미지 재생성 중 오류가 발생했습니다.`);
    } finally {
      setImageLoadingIndices(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const stopPreview = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsPreviewPlaying(false);
    setCurrentSubtitle("");
    setCurrentImageIndex(0);
  };

  const playVideoPreview = async () => {
    if (!finalContent?.audio) return;
    if (isPreviewPlaying) {
      stopPreview();
      return;
    }

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;
    const buffer = await decodePCMToAudioBuffer(finalContent.audio, ctx);
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    setIsPreviewPlaying(true);
    const duration = buffer.duration;
    const startTime = ctx.currentTime;
    audioSourceRef.current = source;
    source.start();

    const interval = setInterval(() => {
      const elapsed = ctx.currentTime - startTime;
      if (elapsed >= duration) {
        clearInterval(interval);
        setIsPreviewPlaying(false);
        return;
      }

      if (elapsed < duration * 0.2) {
        setCurrentSubtitle(finalContent.script.hook);
      } else if (elapsed < duration * 0.8) {
        setCurrentSubtitle(finalContent.script.body);
      } else {
        setCurrentSubtitle(finalContent.script.conclusion);
      }

      const imgIdx = Math.floor((elapsed / duration) * finalContent.images.length);
      setCurrentImageIndex(Math.min(imgIdx, finalContent.images.length - 1));
    }, 100);

    source.onended = () => {
      clearInterval(interval);
      setIsPreviewPlaying(false);
      setCurrentSubtitle("");
      setCurrentImageIndex(0);
    };
  };

  const downloadFile = (data: string, filename: string, mime: string) => {
    const link = document.createElement('a');
    link.href = `data:${mime};base64,${data}`;
    link.download = filename;
    link.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900 font-sans">
      <header className="max-w-6xl mx-auto mb-10 text-center">
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-3 tracking-tighter italic">SHORTS PRO</h1>
        <p className="text-slate-500 font-medium">대본부터 동기화된 영상까지 한 번에 완성</p>
      </header>

      <main className="max-w-6xl mx-auto">
        {error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 text-red-700 rounded-r-lg flex justify-between items-center shadow-md">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold">✕</button>
          </div>
        )}

        {state === 'idle' && (
          <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl max-w-2xl mx-auto border border-slate-200">
            <h2 className="text-3xl font-bold text-center mb-8 text-slate-800">🎥 새로운 쇼츠 생성</h2>
            <form onSubmit={handleStartScripting} className="space-y-8">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500">주제</label>
                <input 
                  type="text" 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:outline-none transition bg-slate-50 text-slate-900"
                  placeholder="예: 서울에서 가장 맛있는 붕어빵 집"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-500 flex justify-between">
                    장면(이미지) 개수 <span>{imageCount}개</span>
                  </label>
                  <input 
                    type="range" min="1" max="20" value={imageCount}
                    onChange={(e) => setImageCount(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-500">화면 비율</label>
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-blue-500 outline-none bg-slate-50"
                  >
                    <option value="9:16">9:16 (쇼츠/릴스)</option>
                    <option value="16:9">16:9 (유튜브/가로)</option>
                    <option value="1:1">1:1 (인스타그램)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-500">비주얼 스타일</label>
                <input 
                  type="text" 
                  value={visualStyle}
                  onChange={(e) => setVisualStyle(e.target.value)}
                  className="w-full px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 focus:outline-none transition bg-slate-50"
                  placeholder="예: Cinematic, 4K Photography, Cyberpunk..."
                />
              </div>

              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl transition-all shadow-xl text-lg transform hover:scale-[1.01] active:scale-95">
                쇼츠 대본 및 구성 생성하기
              </button>
            </form>
          </div>
        )}

        {state === 'scripting' && (
          <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-slate-100 shadow-xl">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-xl font-bold text-slate-800">인공지능이 대본과 음악, 씬을 구성하고 있습니다...</p>
          </div>
        )}

        {state === 'editing' && editableScript && (
          <div className="space-y-8 animate-fadeIn">
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-100">
                <h2 className="text-2xl font-black text-slate-800">📝 대본 최종 수정</h2>
                <div className="bg-blue-100 text-blue-600 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Editor Mode</div>
              </div>
              
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                {(['hook', 'body', 'conclusion'] as const).map(field => (
                  <div key={field} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{field}</label>
                    <textarea 
                      value={editableScript[field]}
                      onChange={(e) => setEditableScript({...editableScript, [field]: e.target.value})}
                      className="w-full h-40 p-4 rounded-xl border border-slate-200 focus:border-blue-500 focus:outline-none bg-slate-50 text-sm leading-relaxed"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-4 mb-10">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">BGM Mood / Prompt</label>
                  <input 
                    type="text"
                    value={editableScript.bgmPrompt}
                    onChange={(e) => setEditableScript({...editableScript, bgmPrompt: e.target.value})}
                    className="w-full bg-transparent border-none focus:outline-none text-sm text-blue-600 italic"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setState('idle')} className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200">뒤로가기</button>
                <button onClick={handleGenerateFinal} className="flex-[2] bg-blue-600 py-4 rounded-2xl text-white font-black shadow-lg hover:bg-blue-700 transition">미디어 자산 일괄 생성하기</button>
              </div>
            </div>
          </div>
        )}

        {state === 'generating_assets' && (
          <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl border border-slate-100 shadow-xl">
            <div className="text-6xl mb-6 animate-pulse">🎬</div>
            <p className="text-2xl font-black mb-2 text-slate-800">미디어 에셋 생성 중</p>
            <p className="text-slate-500">이미지 {imageCount}장을 고해상도로 렌더링하고 있습니다.</p>
          </div>
        )}

        {state === 'completed' && finalContent && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-20 animate-fadeIn">
            {/* Left Col: Video Preview */}
            <div className="lg:col-span-4 space-y-6">
              <div className="sticky top-8">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Video Preview</div>
                <div 
                  className="relative w-full bg-slate-200 rounded-[2rem] overflow-hidden shadow-2xl border-4 border-white group"
                  style={{ aspectRatio: finalContent.aspectRatio.replace(':', '/') }}
                >
                  <img 
                    src={`data:image/png;base64,${finalContent.images[currentImageIndex]}`} 
                    className="w-full h-full object-cover transition-all duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
                  
                  <div className="absolute bottom-10 left-0 right-0 px-6 text-center">
                    {currentSubtitle && (
                      <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg inline-block border border-slate-200 shadow-xl">
                        <p className="text-slate-900 text-sm font-bold leading-tight animate-slideUp">
                          {currentSubtitle}
                        </p>
                      </div>
                    )}
                  </div>

                  {!isPreviewPlaying && (
                    <button 
                      onClick={playVideoPreview}
                      className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/5 transition-all"
                    >
                      <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition">
                        <span className="text-4xl text-white">▶</span>
                      </div>
                    </button>
                  )}

                  {isPreviewPlaying && (
                    <button 
                      onClick={stopPreview}
                      className="absolute top-4 right-4 bg-white/50 hover:bg-white/80 p-2 rounded-full backdrop-blur-md text-slate-900"
                    >
                      ✕
                    </button>
                  )}
                </div>
                
                <div className="mt-6 flex flex-col gap-3">
                  <button 
                    onClick={playVideoPreview}
                    className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition ${isPreviewPlaying ? 'bg-red-500 text-white' : 'bg-slate-900 text-white'}`}
                  >
                    {isPreviewPlaying ? '■ 중지' : '▶ 영상 미리보기 플레이'}
                  </button>
                  <p className="text-[10px] text-center text-slate-500 font-bold uppercase tracking-wider">Subtitle Syncing Active</p>
                </div>
              </div>
            </div>

            {/* Right Col: Asset Editor */}
            <div className="lg:col-span-8 space-y-8">
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl">
                <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-black text-slate-800">🛠️ 미디어 에셋 편집</h3>
                  <button onClick={() => setState('idle')} className="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full">새 프로젝트</button>
                </div>

                <div className="space-y-6 mb-10">
                  <div className="grid md:grid-cols-3 gap-4">
                    {(['hook', 'body', 'conclusion'] as const).map(field => (
                      <div key={field} className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">{field}</label>
                        <textarea 
                          value={finalContent.script[field]}
                          onChange={(e) => setFinalContent({...finalContent, script: {...finalContent.script, [field]: e.target.value}})}
                          className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:border-blue-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={handleRegenerateAudio}
                    disabled={isAudioLoading}
                    className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 disabled:opacity-50"
                  >
                    {isAudioLoading ? '🔄 재녹음 중...' : '🎙️ 수정한 대본으로 다시 녹음하기'}
                  </button>
                </div>

                <h4 className="text-sm font-bold text-slate-400 mb-6 uppercase tracking-widest">장면별 이미지 갤러리</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {finalContent.images.map((img, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group">
                        {imageLoadingIndices.has(idx) ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/60"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent animate-spin rounded-full"></div></div>
                        ) : (
                          <img src={`data:image/png;base64,${img}`} className="w-full h-full object-cover" />
                        )}
                        <button 
                          onClick={() => downloadFile(img, `scene_${idx+1}.png`, 'image/png')}
                          className="absolute bottom-2 right-2 bg-white/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition shadow-sm text-slate-900"
                        >
                          💾
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <input 
                          type="text"
                          value={finalContent.script.imagePrompts[idx]}
                          onChange={(e) => {
                            const newP = [...finalContent.script.imagePrompts];
                            newP[idx] = e.target.value;
                            setFinalContent({...finalContent, script: {...finalContent.script, imagePrompts: newP}});
                          }}
                          className="flex-1 text-[10px] p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                        />
                        <button onClick={() => handleRegenerateImage(idx)} className="text-[10px] bg-slate-100 px-2 rounded-lg hover:bg-slate-200">🔄</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => downloadFile(finalContent.audio || "", 'narration.wav', 'audio/wav')}
                  className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-blue-700 transition"
                >
                  🎙️ 나레이션 파일 받기
                </button>
                <button 
                   onClick={() => alert("현재 환경에서는 클라이언트 측 MP4 렌더링을 위해 FFmpeg.wasm 로드가 필요합니다. 프리뷰 모드를 통해 영상을 확인해주세요!")}
                   className="flex-1 py-5 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-700 transition"
                >
                  🎬 영상 제작 및 내보내기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp { animation: slideUp 0.3s ease-out forwards; }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default App;
