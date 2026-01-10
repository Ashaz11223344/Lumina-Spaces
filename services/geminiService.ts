
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { GenerationSettings, DesignSuggestion, ProductItem, BudgetItem } from '../types';

/**
 * Helper: Expand (Dilate) the mask to ensure full object coverage.
 * This creates a safety buffer around the user's rough annotation.
 */
const expandMask = async (maskBase64: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject("No ctx"); return; }

      // 1. Draw original mask first
      ctx.drawImage(img, 0, 0);

      // 2. Apply Dilation via Shadow
      // This expands the white area into the transparent area
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 40; // Increased to ensure ~20px expansion radius
      
      // Draw multiple times to make the blurred expansion solid/opaque near the center
      // and feathered at the edges. Added an extra pass for robust coverage.
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, 0, 0);
      ctx.drawImage(img, 0, 0);
      ctx.drawImage(img, 0, 0);
      ctx.drawImage(img, 0, 0);
      
      // 3. Draw original again on top to ensure the core remains 100% white
      ctx.shadowBlur = 0;
      ctx.drawImage(img, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = (e) => {
        console.warn("Mask expansion failed", e);
        resolve(maskBase64); // Fallback to original
    };
    img.src = maskBase64;
  });
};

/**
 * Helper: Resize and compress image for Vision API calls.
 * Reduces payload size to prevent 500/XHR errors.
 */
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
          // Export as JPEG 0.8 quality for efficient transmission
          resolve(canvas.toDataURL('image/jpeg', 0.8));
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => {
        console.warn("Image resize failed, using original");
        resolve(base64Str);
    };
    img.src = base64Str;
  });
};

/**
 * Detects potential room improvements using Vision AI.
 * Returns a list of actionable suggestions with Bounding Boxes.
 */
export const detectRoomImprovements = async (base64Image: string, roomType?: string): Promise<DesignSuggestion[]> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing API Key");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-2.5-flash"; // Fast, multimodal

  const prompt = `
    Analyze this interior design photo.
    Context: This is a ${roomType || "Room"}.
    
    Identify 3-4 specific, high-impact changes that could improve the aesthetics typical for a ${roomType || "modern space"}.
    Focus on specific objects that can be masked and replaced (e.g., "Change the photo frames", "Update the rug", "Add a floor lamp").
    
    Return ONLY a JSON array of objects. 
    IMPORTANT: Provide the bounding box for the object to be changed as "box_2d": [ymin, xmin, ymax, xmax] using a scale of 0-1000.
    
    Format:
    [
      { "id": "1", "text": "Replace wooden frames with thin black metal ones", "category": "decor", "box_2d": [200, 300, 400, 500] },
      { "id": "2", "text": "Add a large lush indoor plant in the corner", "category": "decor", "box_2d": [600, 800, 900, 950] }
    ]
    Do not include markdown code blocks. Just the JSON.
  `;

  try {
    // Optimize image size to prevent XHR/RPC errors
    const optimizedImage = await resizeImageForVision(base64Image);

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'image/jpeg', 
              data: optimizedImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
            }
          }
        ]
      },
      config: {
        temperature: 0.4,
      }
    });

    let text = response.text || "[]";
    // Sanitize markdown if present
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text) as DesignSuggestion[];
  } catch (error) {
    console.error("Auto Suggestion Error:", error);
    return [];
  }
};

/**
 * Analyze the generated image to identify shoppable items.
 * Returns a list of products with search queries.
 */
export const analyzeShoppableItems = async (base64Image: string, maskBase64?: string): Promise<ProductItem[]> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing API Key");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-2.5-flash";

  // Prompt strategy: If mask exists, restrict search to that area.
  const prompt = `
    Act as a professional interior design personal shopper for the Indian Market.
    
    I will provide an image of a room design${maskBase64 ? " and a MASK image showing exactly what was edited" : ""}.
    
    TASK:
    Identify 4 specific furniture, decor, or fixture items that match the design.
    ${maskBase64 ? "CRITICAL: FOCUS ONLY ON ITEMS LOCATED IN THE WHITE AREA OF THE MASK. Do not list items that were in the original background unless they were modified." : "Focus on the most prominent stylish items in the room."}

    For each item, generate a "query" that is HIGHLY SPECIFIC to find the EXACT MATCH online.
    Include:
    - Exact visual material (e.g. "Boucle", "Walnut", "Brass")
    - Style (e.g. "Japandi", "Industrial", "Mid-Century")
    - Color nuances (e.g. "Sage Green", "Matte Black")
    - Object type

    Estimate the price range in INDIAN RUPEES (INR/₹).

    Return ONLY a JSON array of objects.
    Format:
    [
      { "id": "p1", "name": "Velvet Accent Chair", "query": "Emerald green velvet tufted accent chair gold legs mid-century modern", "category": "Furniture", "priceRange": "₹12,000 - ₹25,000" }
    ]
    Do not include markdown. Just the JSON.
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);

    const parts: any[] = [
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: optimizedImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
          }
        }
    ];

    if (maskBase64) {
        // Mask is usually small/simple, but optimizing helps consistency
        const optimizedMask = await resizeImageForVision(maskBase64);
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: optimizedMask.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
            }
        });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: { temperature: 0.3 }
    });

    let text = response.text || "[]";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text) as ProductItem[];
  } catch (error) {
    console.error("Shopping Analysis Error:", error);
    return [];
  }
};

/**
 * Estimates renovation costs based on visual analysis.
 */
export const estimateRenovationCost = async (base64Image: string, maskBase64?: string, roomType?: string): Promise<BudgetItem[]> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing API Key");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-2.5-flash";

  const prompt = `
    Act as an experienced Construction Cost Estimator for the INDIAN MARKET (Mumbai/Delhi/Bangalore rates).
    Context: This is a ${roomType || "Room"}.
    Analyze this interior image${maskBase64 ? " and the provided MASK image" : ""}.
    
    TASK: Identify ONLY the new elements, furniture, or finishes that appear to have been added or modified inside the masked area.
    ${maskBase64 ? "CRITICAL: The mask (white area) indicates the EXACT region of change. IGNORE everything outside the mask. Do not price existing items." : "Focus only on the most obvious design upgrades shown."}

    Provide a realistic cost estimation in INDIAN RUPEES (INR).
    
    REALISM RULES:
    1. Labor for small items (like hanging a frame or installing a light) is minimal (e.g., ₹200 - ₹1000). Do NOT estimate thousands for simple decor tasks.
    2. Furniture costs should reflect current Indian retail prices (e.g., Pepperfry, Urban Ladder, Local Market).
    3. Structural work (Flooring, Painting) should be calculated per sq. ft. roughly.
    4. Categorize clearly: "Furniture" (Sofa, Table), "Material" (Tiles, Paint), "Labor" (Installation, Painting), "Decor" (Vases, Frames).

    Return ONLY a JSON array.
    
    Format:
    [
      { "id": "b1", "item": "Teak Wood Flooring (Approx 100 sq ft)", "costMin": 15000, "costMax": 25000, "category": "Material" },
      { "id": "b2", "item": "Installation Labor", "costMin": 2000, "costMax": 5000, "category": "Labor" }
    ]
  `;

  try {
    const optimizedImage = await resizeImageForVision(base64Image);

    const parts: any[] = [
        { text: prompt },
        {
            inlineData: {
                mimeType: 'image/jpeg',
                data: optimizedImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
            }
        }
    ];

    if (maskBase64) {
        const optimizedMask = await resizeImageForVision(maskBase64);
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: optimizedMask.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
            }
        });
    }

    const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: { temperature: 0.2 }
    });

    let text = response.text || "[]";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text) as BudgetItem[];
  } catch (error) {
      console.error("Budget Estimation Error:", error);
      return [];
  }
};

/**
 * orchestrateDesign
 * Acts as the orchestration engine. Takes user brief, style, and VISUAL CONTEXT (Image + Mask)
 * to produce a "crystal clear inpainting instruction".
 */
export const orchestrateDesign = async (
  settings: GenerationSettings,
  base64Image: string,
  maskBase64?: string
): Promise<string> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing API Key");

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // Use fast model for orchestration
  const model = "gemini-2.5-flash";

  // If we have a mask, expand it first for the AI's context so it sees a larger area
  let contextMask = maskBase64;
  if (maskBase64) {
      try {
          contextMask = await expandMask(maskBase64);
      } catch (e) { console.warn("Orchestration mask expansion failed", e); }
  }

  const systemPrompt = `
    You are the Senior Design Orchestrator for an interior design AI. 
    Your goal is to look at a user's ${settings.roomType} photo and their selected mask and write the PERFECT prompt for an image generator.

    INPUTS:
    1. The original room photo (${settings.roomType}).
    2. A mask image (Black = ignore, White = edit area).
    3. User settings (Brief, Style, Lighting).

    CRITICAL RULES FOR MASKED EDITS:
    - The user's mask is ROUGH. It covers an object they want to REPLACE.
    - You must Identify the object (e.g., "The wooden picture frame") and describe a BRAND NEW VERSION of it.
    - Your output prompt must describe the new design in a way that fits the ${settings.roomType} but looks DISTINCT from the original pixels.
    - Explicitly mention perspective and lighting context (e.g., "hanging on the wall", "sitting on the floor").
    
    SAFETY & ANTI-RECITATION RULES:
    - If the masked area contains artwork, posters, or photos: Describe a "GENERIC CONTEMPORARY ART PIECE" or "ABSTRACT PRINT".
    - NEVER describe specific details of the existing art (e.g., do NOT say "A painting of a house on a lake").
    - ALWAYS ask for a "New Design" or "Different Version".
    - If the user brief is "change style", focus on material changes (wood -> metal, fabric -> leather).

    Output Format:
    - A single, descriptive paragraph.
  `;

  const userPromptText = `
    Room Type: ${settings.roomType}
    User Brief: ${settings.prompt || "No specific brief provided, match the room's style."}
    Style Constraint: ${settings.style}
    Lighting Constraint: ${settings.lighting}
    Creativity Level: ${settings.creativity}%
    ${maskBase64 
      ? "ACTION: The user has masked a specific object. Write a prompt to REPLACE it with a new design that fits the style. Ensure the description is generic enough to avoid copyright triggers." 
      : `ACTION: No mask provided. Write a prompt to restyle the entire ${settings.roomType} globally.`}
  `;

  try {
    const parts: any[] = [
        { text: userPromptText }
    ];

    if (base64Image) {
        // Optimize context image size
        const optimizedImage = await resizeImageForVision(base64Image);
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: optimizedImage.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
            }
        });
    }

    if (contextMask) {
        // Mask optimization
        const optimizedMask = await resizeImageForVision(contextMask);
        parts.push({
            inlineData: {
                mimeType: 'image/jpeg',
                data: optimizedMask.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '')
            }
        });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.85, // High temp to encourage divergence
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ]
      }
    });

    return response.text || "Generate a modern interior design element fitting the scene.";
  } catch (error) {
    console.error("Orchestration Error:", error);
    return `Create a ${settings.style} design element matching the room's perspective and lighting.`;
  }
};

/**
 * generateRoomImage
 * Uses Gemini Flash Image to execute the visual design.
 */
export const generateRoomImage = async (
  base64Image: string,
  orchestratedPrompt: string,
  maskBase64?: string
): Promise<string> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing API Key");

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  // gemini-2.5-flash-image is good for general image tasks and editing via prompting
  const model = "gemini-2.5-flash-image";

  try {
    // Clean base64 strings
    const cleanImage = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    
    // IMPORTANT: Expand the mask BEFORE sending to AI.
    let effectiveMask = maskBase64;
    let cleanMask = maskBase64 ? maskBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '') : undefined;

    if (maskBase64) {
        try {
            effectiveMask = await expandMask(maskBase64);
            cleanMask = effectiveMask.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
        } catch (e) {
            console.warn("Mask expansion failed in gen phase", e);
        }
    }

    // Construct parts
    const parts: any[] = [
        {
          text: `You are an expert interior design AI.
          
          TASK:
          ${effectiveMask ? "REPLACE the masked area with a COMPLETELY NEW DESIGN. Do not restore the original." : "Redesign the room."}
          
          PROMPT:
          "${orchestratedPrompt}"
          
          STRICT GENERATION RULES TO AVOID ERRORS:
          1. DIVERGENCE IS MANDATORY: The generated object MUST have different details, textures, or patterns than the original pixels.
          2. NO RECITATION: Do not output an identical copy of the masked content. If the mask covers art, generate NEW art.
          3. FULL OBJECTS: Even if the mask is rough, generate the COMPLETE object (frame, lamp, furniture) so it looks natural.
          4. BLENDING: Match the lighting, shadows, and perspective of the surrounding room perfectly.
          5. AVOID TEXT: Do not generate legible text.
          
          Output only the final image.`
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: cleanImage
          }
        }
    ];

    if (cleanMask) {
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: cleanMask
            }
        });
    }

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
        ]
      }
    });

    let generatedImage: string | null = null;
    
    // Safely parse candidates
    const candidates = response.candidates;
    if (candidates && candidates.length > 0 && candidates[0]?.content?.parts) {
       for (const part of candidates[0].content.parts) {
         if (part.inlineData) {
            generatedImage = `data:image/png;base64,${part.inlineData.data}`;
            break;
         }
       }
    }
    
    if (!generatedImage) {
        console.warn("No image generated. Response dump:", response);
        let errorDetails = "No details provided.";
        if (response.candidates && response.candidates.length > 0) {
            errorDetails = `Finish Reason: ${response.candidates[0].finishReason}`;
        } else if (response.promptFeedback) {
            errorDetails = `Prompt Blocked: ${JSON.stringify(response.promptFeedback)}`;
        }
        throw new Error(`Generation failed or blocked. Details: ${errorDetails}`);
    }

    return generatedImage;

  } catch (error) {
    console.error("Generation Error:", error);
    throw error;
  }
};

/**
 * Generates a depth map for 3D visualization.
 */
export const generateDepthMap = async (base64Image: string): Promise<string> => {
  const API_KEY = process.env.API_KEY || '';
  if (!API_KEY) throw new Error("Missing API Key");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const model = "gemini-2.5-flash-image"; // Use a vision capable model

  try {
     const cleanImage = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

     const response = await ai.models.generateContent({
       model,
       contents: {
         parts: [
           {
             text: "Generate a high-fidelity grayscale depth map for this interior design image. Lighter values should indicate closer objects, and darker values should indicate further objects. The output must be strictly the depth map image, preserving the exact aspect ratio and composition."
           },
           {
             inlineData: {
               mimeType: 'image/png', // Assuming png input is fine, or detect
               data: cleanImage
             }
           }
         ]
       }
     });

     // Extract image
     let generatedImage: string | null = null;
     const candidates = response.candidates;
     if (candidates && candidates.length > 0 && candidates[0]?.content?.parts) {
       for (const part of candidates[0].content.parts) {
         if (part.inlineData) {
            generatedImage = `data:image/png;base64,${part.inlineData.data}`;
            break;
         }
       }
     }

     if (!generatedImage) {
         throw new Error("Failed to generate depth map image.");
     }

     return generatedImage;

  } catch (error) {
    console.error("Depth Map Generation Error:", error);
    throw error;
  }
};
