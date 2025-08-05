import singleLifestyleNoSubject from '../image_prompt_instructions/single_lifestyle_no_subject';
import singleLifestyleWithSubject from '../image_prompt_instructions/single_lifestyle_with_subject';
import singleLifestyleEmotional from '../image_prompt_instructions/single_lifestyle_emotional';
import singleStudio from '../image_prompt_instructions/single_studio';
import singleCloseup from '../image_prompt_instructions/single_closeup';
import singleWhiteBackground from '../image_prompt_instructions/single_white_background';
import multiLifestyleNoSubject from '../image_prompt_instructions/multi_lifestyle_no_subject';
import multiLifestyleWithSubject from '../image_prompt_instructions/multi_lifestyle_with_subject';
import multiLifestyleEmotional from '../image_prompt_instructions/multi_lifestyle_emotional';
import multiStudio from '../image_prompt_instructions/multi_studio';
import multiCloseup from '../image_prompt_instructions/multi_closeup';
import multiWhiteBackground from '../image_prompt_instructions/multi_white_background';

export const SINGLE_STYLE_TO_INSTRUCTIONS = {
  lifestyle_no_subject: singleLifestyleNoSubject,
  lifestyle_with_subject: singleLifestyleWithSubject,
  lifestyle_emotional: singleLifestyleEmotional,
  studio: singleStudio,
  closeup: singleCloseup,
  white_background: singleWhiteBackground,
} as const;

export const MULTI_STYLE_TO_INSTRUCTIONS = {
  lifestyle_no_subject: multiLifestyleNoSubject,
  lifestyle_with_subject: multiLifestyleWithSubject,
  lifestyle_emotional: multiLifestyleEmotional,
  studio: multiStudio,
  closeup: multiCloseup,
  white_background: multiWhiteBackground,
} as const;

export type StyleKey = keyof typeof SINGLE_STYLE_TO_INSTRUCTIONS;