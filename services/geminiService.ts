
import { GoogleGenAI, Type } from "@google/genai";
import { GenerationSettings, DesignSuggestion, ProductItem, BudgetItem, RoomType } from '../types';

// Global instances are avoided to ensure fresh initialization with the current API key 
// from process.env.API_KEY before each request, following SDK guidelines.

const resizeImageForVision = (base64Str: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height *= maxWidth / width;
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
};

/**
 * Detects potential room improvements using Gemini 3 Flash with structured JSON output.
 */
export const detectRoomImprovements = async (base64Image: string, roomType?: string): Promise<DesignSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const prompt = `
    Analyze this interior design photo of a ${roomType || "Room"}.
    Identify 3-4 specific high-impact changes that could improve the aesthetics.
    Focus on items that can be replaced or added.
    For each item, identify its position in the image.
    Provide the bounding box as "box_2d": [ymin, xmin, ymax, xmax] using scale 0-1000.
    Be creative and architecturally sound.
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: optimizedImage.split(',')[1] } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              text: { type: Type.STRING },
              category: { type: Type.STRING },
              box_2d: { 
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: 'Bounding box [ymin, xmin, ymax, xmax] normalized 0-1000'
              }
            },
            required: ["id", "text", "category", "box_2d"]
          }
        }
      }
    });

    return JSON.parse(response.text) as DesignSuggestion[];
  } catch (error) {
    console.error("Auto Suggestion Error:", error);
    return [];
  }
};

/**
 * Orchestrates detailed design instructions from user preferences.
 */
export const orchestrateDesign = async (settings: GenerationSettings, base64Image: string, maskBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";
  const prompt = `
    Task: Act as a master architect. Refine the user's design prompt into a highly detailed visual instruction for an image generation model.
    
    CRITICAL CONSTRAINT: 
    The architectural structure must be preserved exactly. The ceilings, window positions, window sizes, and wall dimensions must not be changed, moved, or resized. They should be exactly as they appear in the original image.
    
    Context:
    - Room: ${settings.roomType}
    - User Request: "${settings.prompt}"
    - Style: ${settings.style}
    - Lighting: ${settings.lighting}
    - Masking: ${maskBase64 ? "The user has selected a specific area to modify." : "The whole room will be redesigned while respecting fixed architecture."}
    
    Output a single paragraph of detailed descriptive text that captures the textures, materials, and lighting atmosphere. Ensure the description implies the preservation of existing structural elements like windows and ceilings. Do not include introductory text.
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);
    const parts: any[] = [
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: optimizedImage.split(',')[1] } }
    ];
    if (maskBase64) {
      const optimizedMask = await resizeImageForVision(maskBase64);
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: optimizedMask.split(',')[1] } });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts }
    });

    return response.text;
  } catch (error) {
    console.error("Orchestration Error:", error);
    return `A ${settings.style} style ${settings.roomType} with ${settings.lighting} lighting. ${settings.prompt}`;
  }
};

/**
 * Generates redesigned room images using inpainting techniques.
 */
export const generateRoomImage = async (base64Image: string, prompt: string, maskBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash-image";
  
  const contents: any = {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: (await resizeImageForVision(base64Image)).split(',')[1] } },
      { text: `
        Strict Requirement: The resulting image must keep the room's core dimensions, ceilings, and window positions exactly as they are in the original. Do not move, resize, or break the architecture. 
        Focus on: ${prompt}
      ` }
    ]
  };

  if (maskBase64) {
    contents.parts.push({
      inlineData: { mimeType: 'image/png', data: maskBase64.split(',')[1] }
    });
    contents.parts.push({ text: "Only modify the area specified by the mask. Seamlessly blend the new design with the existing fixed structural boundaries." });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated by model");
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

/**
 * Extracts shoppable furniture data with exact image coordinates.
 */
export const analyzeShoppableItems = async (base64Image: string, maskBase64?: string): Promise<ProductItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  const prompt = `
    Identify 4 specific furniture or decor items in this design.
    ${maskBase64 ? "FOCUS ON ITEMS IN THE REDESIGNED AREA." : ""}
    Provide specific search queries and price ranges in INR.
    For each item, provide its exact position in the image using normalized coordinates [ymin, xmin, ymax, xmax] (scale 0-1000) as "box_2d".
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: optimizedImage.split(',')[1] } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              query: { type: Type.STRING },
              category: { type: Type.STRING },
              priceRange: { type: Type.STRING },
              box_2d: { 
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: 'Bounding box [ymin, xmin, ymax, xmax] normalized 0-1000'
              }
            },
            required: ["id", "name", "query", "category", "box_2d"]
          }
        }
      }
    });
    return JSON.parse(response.text) as ProductItem[];
  } catch (error) {
    console.error("Shopping Analysis Error:", error);
    return [];
  }
};

/**
 * Estimates materials and labor costs for the redesign project.
 */
export const estimateRenovationCost = async (base64Image: string, maskBase64?: string, roomType?: string): Promise<BudgetItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  const prompt = `
    Act as a local Indian contractor. Estimate the cost of elements in this redesign of a ${roomType || "Room"}.
    Provide a realistic breakdown of material and labor costs in INR.
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: optimizedImage.split(',')[1] } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              item: { type: Type.STRING },
              costMin: { type: Type.NUMBER },
              costMax: { type: Type.NUMBER },
              category: { type: Type.STRING }
            },
            required: ["id", "item", "costMin", "costMax", "category"]
          }
        }
      }
    });
    return JSON.parse(response.text) as BudgetItem[];
  } catch (error) {
    console.error("Cost Estimation Error:", error);
    return [];
  }
};

/**
 * Generates a depth map for volumetric 3D visualization.
 */
export const generateDepthMap = async (base64Image: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash-image";
  const prompt = `
    Generate a grayscale depth map of this interior design image.
    Brighter pixels are closer to the camera.
    Return ONLY the image data.
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: optimizedImage.split(',')[1] } }
        ]
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Depth map generation failed");
  } catch (error) {
    console.error("Depth Map Error:", error);
    throw error;
  }
};
