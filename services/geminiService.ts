import { GoogleGenAI } from "@google/genai";
import { GenerationSettings, DesignSuggestion, ProductItem, BudgetItem, RoomType } from '../types';

// Corrected SDK initialization to follow Google GenAI SDK guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

const parseJsonResponse = (text: string) => {
  try {
    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error("Failed to parse JSON from model response:", text);
    throw new Error("Model response was not valid JSON");
  }
};

/**
 * Detects potential room improvements using Gemini 3 Flash.
 */
export const detectRoomImprovements = async (base64Image: string, roomType?: string): Promise<DesignSuggestion[]> => {
  const model = "gemini-3-flash-preview"; 

  const prompt = `
    Analyze this interior design photo of a ${roomType || "Room"}.
    Identify 3-4 specific high-impact changes that could improve the aesthetics.
    Focus on items that can be replaced or added.
    For each item, identify its position in the image.
    
    Return ONLY a raw JSON array of objects. 
    IMPORTANT: Provide the bounding box for the object as "box_2d": [ymin, xmin, ymax, xmax] using scale 0-1000.
    
    SCHEMA:
    [
      { "id": "1", "text": "Replace the existing rug with a plush cream textured rug", "category": "decor", "box_2d": [ymin, xmin, ymax, xmax] }
    ]
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

    return parseJsonResponse(response.text) as DesignSuggestion[];
  } catch (error) {
    console.error("Auto Suggestion Error:", error);
    return [];
  }
};

export const orchestrateDesign = async (settings: GenerationSettings, base64Image: string, maskBase64?: string): Promise<string> => {
  const model = "gemini-3-pro-preview";
  const prompt = `
    Task: Act as a master architect. Refine the user's design prompt into a highly detailed visual instruction for an image generation model.
    
    Context:
    - Room: ${settings.roomType}
    - User Request: "${settings.prompt}"
    - Style: ${settings.style}
    - Lighting: ${settings.lighting}
    - Masking: ${maskBase64 ? "The user has selected a specific area to modify." : "The whole room will be redesigned."}
    
    Output a single paragraph of detailed descriptive text that captures the textures, materials, and lighting atmosphere. Do not include introductory text.
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

export const generateRoomImage = async (base64Image: string, prompt: string, maskBase64?: string): Promise<string> => {
  const model = "gemini-2.5-flash-image";
  
  const contents: any = {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: (await resizeImageForVision(base64Image)).split(',')[1] } },
      { text: prompt }
    ]
  };

  if (maskBase64) {
    contents.parts.push({
      inlineData: { mimeType: 'image/png', data: maskBase64.split(',')[1] }
    });
    contents.parts.push({ text: "Only modify the area specified by the mask. Seamlessly blend the new design with the existing architecture." });
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

export const analyzeShoppableItems = async (base64Image: string, maskBase64?: string): Promise<ProductItem[]> => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Identify 4 specific furniture or decor items in this design.
    ${maskBase64 ? "FOCUS ON ITEMS IN THE REDESIGNED AREA." : ""}
    Provide specific search queries and price ranges in INR.
    
    Return ONLY JSON.
    SCHEMA:
    [
      { "id": "p1", "name": "Item Name", "query": "Specific Search Query", "category": "Furniture", "priceRange": "₹10,000 - ₹20,000" }
    ]
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
    return parseJsonResponse(response.text) as ProductItem[];
  } catch (error) {
    console.error("Shopping Analysis Error:", error);
    return [];
  }
};

export const estimateRenovationCost = async (base64Image: string, maskBase64?: string, roomType?: string): Promise<BudgetItem[]> => {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Act as a local Indian contractor. Estimate the cost of elements in this redesign.
    Return ONLY JSON array.
    SCHEMA:
    [
      { "id": "b1", "item": "Item Name", "costMin": 5000, "costMax": 10000, "category": "Material" }
    ]
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
    return parseJsonResponse(response.text) as BudgetItem[];
  } catch (error) {
    console.error("Cost Estimation Error:", error);
    return [];
  }
};

export const generateDepthMap = async (base64Image: string): Promise<string> => {
  // Corrected: gemini-3-pro-preview is a text model. Using gemini-2.5-flash-image for image-to-image/editing tasks.
  const model = "gemini-2.5-flash-image";
  const prompt = `
    Generate a grayscale depth map of this image.
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
