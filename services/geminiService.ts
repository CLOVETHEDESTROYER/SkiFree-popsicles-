import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// Simple in-memory rate limit tracker to prevent hammering the API after a 429
let isRateLimited = false;

const getFallbackCommentary = (event: string, cause?: string) => {
   if (event === 'eaten') return "OM NOM NOM! The Yeti is full.";
   if (event === 'crash') return `Ouch! That looked painful. (Hit ${cause || 'something'})`;
   if (event === 'highscore') return "New Record! Amazing skiing!";
   return "SkiFree: Watch out for the Yeti!";
};

export const generateGameCommentary = async (
  event: 'start' | 'crash' | 'eaten' | 'highscore',
  details: { distance?: number; speed?: number; cause?: string }
): Promise<string> => {
  // If we have recently hit a rate limit, use fallback immediately
  if (isRateLimited) {
      return getFallbackCommentary(event, details.cause);
  }

  const client = getClient();
  if (!client) {
    return getFallbackCommentary(event, details.cause);
  }

  try {
    let prompt = "";
    switch (event) {
      case 'start':
        prompt = "Write a short, witty, one-sentence headline for a ski resort newspaper announcing a new skier is hitting the slopes.";
        break;
      case 'crash':
        prompt = `The skier crashed into a ${details.cause} after skiing ${Math.floor(details.distance || 0)} meters. Write a short, snarky comment (max 10 words).`;
        break;
      case 'eaten':
        prompt = `The Abominable Snow Monster ate the skier after ${Math.floor(details.distance || 0)} meters. Write a terrifying but funny message (max 10 words).`;
        break;
      case 'highscore':
        prompt = `New record set! ${Math.floor(details.distance || 0)} meters! Write a celebratory shout (max 5 words).`;
        break;
    }

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.9,
      }
    });

    return response.text?.trim() || getFallbackCommentary(event, details.cause);
  } catch (error: any) {
    const errorMessage = error.message || JSON.stringify(error);
    
    // Gracefully handle 429 (Resource Exhausted) and Quota limits
    if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
        console.warn("Gemini API Quota Exceeded. Switching to offline commentary for 60 seconds.");
        isRateLimited = true;
        setTimeout(() => isRateLimited = false, 60000); // Cooldown for 1 minute
        return getFallbackCommentary(event, details.cause);
    }
    
    console.error("Gemini API Error:", error);
    return "The Yeti disconnected the API cable.";
  }
};