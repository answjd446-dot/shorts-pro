
export interface ShortsScript {
  hook: string;
  body: string;
  conclusion: string;
  bgmPrompt: string;
  imagePrompts: string[];
}

export interface GeneratedContent {
  script: ShortsScript;
  images: string[]; 
  audio: string | null;
  aspectRatio: string;
}
