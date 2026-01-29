
import { GoogleGenAI, Type } from "@google/genai";
import { GenerationSettings, DesignSuggestion, ProductItem, BudgetItem, RoomType, MeasurementPoint } from '../types';

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

export const detectRoomImprovements = async (base64Image: string, roomType?: string): Promise<DesignSuggestion[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 

  const prompt = `
    Role: Professional Real-Estate Interior Stager.
    Task: Identify 3-4 high-impact, BUILDABLE improvements for this ${roomType || "Room"}.
    
    STRICT CONSTRAINTS:
    - Suggest only REAL-WORLD items (market-ready furniture, standard flooring, real light fixtures).
    - No abstract or conceptual shapes.
    - Provide a tight, accurate bounding box [ymin, xmin, ymax, xmax] (scale 0-1000) where the item should be placed.
    - Focus on ergonomic flow and premium retail silhouettes.
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
                description: 'Precise bounding box [ymin, xmin, ymax, xmax] normalized 0-1000'
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

export const orchestrateDesign = async (settings: GenerationSettings, base64Image: string, maskBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview"; 
  
  const dims = settings.dimensions;
  const dimensionConstraint = dims && (dims.length || dims.width || dims.height)
    ? `DIMENSIONAL CONSTRAINTS: Length: ${dims.length || 'N/A'}m, Width: ${dims.width || 'N/A'}m, Height: ${dims.height || 'N/A'}m. All design elements must fit exactly within these 1:1 metric proportions.`
    : "Dimensions are not specified; infer scale strictly from the input image without altering proportions.";

  const prompt = `
    Role: Master Orchestration Engine and Architect. 
    Task: Convert user vision into a technical redesign brief while preserving architectural ground truth.
    
    ARCHITECTURAL INTEGRITY RULES:
    1. Use the provided image as the EXACT structural reference.
    2. Do NOT change, remove, shift, resize, replace, or hallucinate any architectural elements.
    3. Strictly preserve: Original room layout and proportions, exact wall positions, ALL windows (number, position, size, frame), doors, openings, corners, ceiling and floor boundaries.
    4. Windows MUST remain windows. Do NOT replace windows with walls.
    5. ONLY redesign surface textures, materials, colors, and interior styling.
    6. ${dimensionConstraint}

    Briefing Requirements:
    - Only use REAL-WORLD MATERIALS: White Oak, Polished Concrete, Linen, Brushed Steel, etc.
    - Specify furniture silhouettes from REAL e-commerce categories.
    
    Context:
    - Room: ${settings.roomType}
    - User Request: "${settings.prompt}"
    - Style: ${settings.style}
    
    Output a single, dense paragraph of technical spatial instructions.
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
    return `A ${settings.style} ${settings.roomType} with real-world furniture and premium finishes.`;
  }
};

export const generateRoomImage = async (base64Image: string, prompt: string, maskBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash-image"; 
  
  const architecturalConstraints = `
    STRICT PRESERVATION RULES:
    - Use the provided image as the EXACT structural reference.
    - Do NOT change, remove, shift, resize, replace, or hallucinate any architectural elements.
    - Strictly preserve: Original room layout/proportions, exact wall positions, ALL windows (number, position, size, frame), doors, openings, corners, ceiling and floor boundaries.
    - Windows must remain windows. Do NOT replace windows with walls or solid surfaces.
    - Do NOT cover, block, or modify windows in any way.
    - Maintain 1:1 scale accuracy.
    - Treat the input image as immutable architectural ground truth.
    - ONLY apply visual enhancement to: Surface textures, materials, colors, lighting, and interior styling.
    
    NEGATIVE PROMPT:
    remove window, missing window, wall instead of window, altered layout, structural change, geometry change, incorrect dimensions, scale mismatch, resized room, extra wall, blocked window, hallucinated structure.
  `;

  const contents: any = {
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: (await resizeImageForVision(base64Image)).split(',')[1] } },
      { text: `
        TASK: High-Fidelity Room Re-staging.
        ${architecturalConstraints}
        
        DESIGN INSTRUCTIONS:
        1. Replace items and textures according to: ${prompt}.
        2. Only use commercially available, real-world interior design elements.
        3. Technical Quality: Sharp 8k photography, realistic textures, cinematic soft lighting.
      ` }
    ]
  };

  if (maskBase64) {
    contents.parts.push({
      inlineData: { mimeType: 'image/png', data: maskBase64.split(',')[1] }
    });
    contents.parts.push({ text: "CRITICAL: ONLY redesign the area highlighted in the mask. The rest of the image MUST remain 100% identical to the source. Seamless integration is mandatory." });
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
    throw new Error("No image generated");
  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

export const analyzeShoppableItems = async (
  base64Image: string, 
  maskBase64?: string, 
  settings?: GenerationSettings,
  orchestratedPrompt?: string
): Promise<ProductItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Task: Object Detection and Product Grounding.
    Analyze this interior and detect exactly 4 real-world furniture/decor items.
    
    CONTEXT FOR MATCHING:
    - User Intent: "${settings?.prompt || 'N/A'}"
    - Design Brief: "${orchestratedPrompt || 'N/A'}"
    
    STRICT GROUNDING REQUIREMENT:
    - For each item, you MUST provide a tight bounding box [ymin, xmin, ymax, xmax] (scale 0-1000) that wraps the object perfectly.
    - Pins will be placed at the center of this box. Accuracy is 100% required.
    
    DATA FIELDS:
    - query: A specific search string for a real e-commerce engine.
    - dimensions: Real-world estimates in cm.
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
              dimensions: {
                type: Type.OBJECT,
                properties: {
                  length: { type: Type.STRING },
                  width: { type: Type.STRING },
                  height: { type: Type.STRING }
                },
                required: ["length", "width", "height"]
              },
              box_2d: { 
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: '[ymin, xmin, ymax, xmax] 0-1000'
              },
              isSpaceOptimized: { type: Type.BOOLEAN }
            },
            required: ["id", "name", "query", "category", "box_2d", "dimensions", "isSpaceOptimized"]
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

export const estimateRenovationCost = async (base64Image: string, maskBase64?: string, roomType?: string): Promise<BudgetItem[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  const prompt = `
    Contractor Estimator Mode. Provide real-world market costs in INR for materials and furniture shown in this redesign.
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
    return [];
  }
};

export const generateDepthMap = async (base64Image: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-2.5-flash-image";
  const prompt = "Render a high-precision grayscale depth map of this interior for 3D reconstruction.";

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
    throw new Error("Depth Map Render Failed");
  } catch (error) {
    throw error;
  }
};

export const estimateRealWorldDistance = async (base64Image: string, start: MeasurementPoint, end: MeasurementPoint): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  const prompt = `Using parallax and known objects in this image, estimate the distance between P1[${start.x}, ${start.y}] and P2[${end.x}, ${end.y}]. Respond ONLY with the value and unit.`;

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
    return response.text?.trim() || "---";
  } catch (error) {
    return "Error";
  }
};
