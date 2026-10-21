import {z} from 'zod';
export const settingsSchema=z.object({adaptiveTheme:z.boolean()}).strict();
export const defaultSettings={adaptiveTheme:true};
