
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ShortsScript } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const generateInitialScript = async (topic: string, imageCount: number): Promise<ShortsScript> => {
  const ai = getAI();
  const scriptResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `주제: "${topic}"에 대한 30초짜리 쇼츠 대본을 만들어줘. 
    1. 후킹, 본문, 마침글을 나눠서 작성해줘. 
    2. 각 파트는 한 줄씩 자막으로 나오기 좋게 간결하게 작성해줘.
    3. 각 장면에 어울리는 이미지 프롬프트 ${imageCount}개를 포함해줘.
    4. 이 영상에 어울리는 배경음악(BGM)에 대한 간단한 묘사(영문 프롬프트)도 1개 작성해줘.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          hook: { type: Type.STRING },
          body: { type: Type.STRING },
          conclusion: { type: Type.STRING },
          bgmPrompt: { type: Type.STRING, description: "BGM description for the mood" },
          imagePrompts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: `${imageCount} specific image prompts for the scenes.`
          }
        },
        required: ["hook", "body", "conclusion", "imagePrompts", "bgmPrompt"]
      }
    }
  });

  return JSON.parse(scriptResponse.text);
};

export const generateSingleImage = async (prompt: string, aspectRatio: any, style: string): Promise<string> => {
  const ai = getAI();
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: `Style: ${style}. High quality, detailed: ${prompt}`,
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any
        }
      }
    });
    const part = res.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    return part?.inlineData?.data || "";
  } catch (e) {
    console.error("Image generation failed:", e);
    return "";
  }
};

export const regenerateAudio = async (script: ShortsScript): Promise<string | null> => {
  const ai = getAI();
  // Using punctuation to help with natural pauses for sync
  const fullText = `${script.hook}. ${script.body}. ${script.conclusion}.`;
  try {
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say warmly and enthusiastically: ${fullText}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (e) {
    console.error("Audio generation failed:", e);
    return null;
  }
};

export const generateAssets = async (scriptData: ShortsScript, aspectRatio: string, style: string) => {
  const imagePromises = scriptData.imagePrompts.map(prompt => generateSingleImage(prompt, aspectRatio, style));
  const images = await Promise.all(imagePromises);
  const audioData = await regenerateAudio(scriptData);

  return {
    images,
    audio: audioData
  };
};

export const decodePCMToAudioBuffer = async (base64: string, ctx: AudioContext) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const numChannels = 1;
  const sampleRate = 24000;
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
};
