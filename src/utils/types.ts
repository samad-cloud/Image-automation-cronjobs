import { z } from 'zod';

export const SingleProductClassificationSchema = z.object({
  isSingleProduct: z.boolean(),
  productName: z.string()
});
export type SingleProductClassification = z.infer<typeof SingleProductClassificationSchema>;

export const PersonaResponseSchema = z.object({
  persona: z.string(),
  products: z.array(z.string()),
});
export type PersonaResponse = z.infer<typeof PersonaResponseSchema>;

export const ProductDescriptionSchema = z.object({
  product_name: z.string(),
  product_description: z.string(),
  found: z.boolean(),
});
export type ProductDescription = z.infer<typeof ProductDescriptionSchema>;

export const PlaceholderImageSchema = z.object({
  product: z.string(),
  description: z.string(),
});
export type PlaceholderImage = z.infer<typeof PlaceholderImageSchema>;

export const ImagePromptVariantSchema = z.object({
  prompt: z.string(),
  prompt_success: z.boolean(),
});
export type ImagePromptVariant = z.infer<typeof ImagePromptVariantSchema>;

export const GeneratedPromptsResponseSchema = z.object({
  style: z.string(),
  variant: ImagePromptVariantSchema,
});
export type GeneratedPromptsResponse = z.infer<typeof GeneratedPromptsResponseSchema>;
