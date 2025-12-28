import { z } from 'zod';

// ============================================================================
// Casting Registry (E.3)
// ============================================================================

export const VoiceSettingsSchema = z.object({
  stability: z.number().min(0).max(1).default(0.5),
  similarity_boost: z.number().min(0).max(1).default(0.75),
  style: z.number().min(0).max(1).default(0),
  use_speaker_boost: z.boolean().default(true),
});

export const NarratorToneOverridesSchema = z.record(
  z.enum(['Neutral', 'Ominous', 'Urgent', 'Ironic']),
  VoiceSettingsSchema.partial()
);

export const VoiceMappingSchema = z.object({
  character_id: z.string(),
  eleven_voice_id: z.string(),
  voice_name: z.string(),
  is_narrator: z.boolean().optional(),
  default_settings: VoiceSettingsSchema,
  notes: z.string().optional(),
  tone_overrides: NarratorToneOverridesSchema.optional(),
});

export const UnassignedVoiceSchema = z.object({
  character_id: z.string(),
  first_appearance: z.string(),
  line_count: z.number(),
  suggested_type: z.string().optional(),
  status: z.literal('VOICE_REQUIRED'),
});

export const CastingRegistrySchema = z.object({
  casting: z.object({
    version: z.string(),
    last_updated: z.string(),
    voice_mappings: z.array(VoiceMappingSchema),
    unassigned: z.array(UnassignedVoiceSchema).optional(),
  }),
});

export type VoiceSettings = z.infer<typeof VoiceSettingsSchema>;
export type VoiceMapping = z.infer<typeof VoiceMappingSchema>;
export type UnassignedVoice = z.infer<typeof UnassignedVoiceSchema>;
export type CastingRegistry = z.infer<typeof CastingRegistrySchema>;

// ============================================================================
// Audio Segments (E.7)
// ============================================================================

export const PerformanceHintsSchema = z.object({
  tone: z.enum(['Neutral', 'Ominous', 'Urgent', 'Ironic']).optional(),
  stage_direction: z.string().optional(),
  stability_override: z.number().min(0).max(1).optional(),
  style_override: z.number().min(0).max(1).optional(),
});

export const AudioSegmentSchema = z.object({
  segment_id: z.string(),
  type: z.enum(['narrator', 'dialogue']),
  character_id: z.string(),
  raw_text: z.string(),
  clean_text: z.string(),
  performance: PerformanceHintsSchema.optional(),
});

export const SceneAudioSchema = z.object({
  scene_id: z.string(),
  audio_segments: z.array(AudioSegmentSchema),
});

export const AudioTurnSchema = z.object({
  turn_id: z.string(),
  file: z.string(),
  duration_ms: z.number(),
  cumulative_offset_ms: z.number(),
});

export const AudioTimingManifestSchema = z.object({
  scene_id: z.string(),
  audio_segments: z.array(AudioTurnSchema),
  total_duration_ms: z.number(),
  inter_turn_silence_ms: z.number().default(500),
});

export type PerformanceHints = z.infer<typeof PerformanceHintsSchema>;
export type AudioSegment = z.infer<typeof AudioSegmentSchema>;
export type SceneAudio = z.infer<typeof SceneAudioSchema>;
export type AudioTurn = z.infer<typeof AudioTurnSchema>;
export type AudioTimingManifest = z.infer<typeof AudioTimingManifestSchema>;

// ============================================================================
// Storyboard (E.6)
// ============================================================================

export const ShotTypeSchema = z.enum([
  'wide',
  'medium',
  'close',
  'extreme_close',
  'over_shoulder',
]);

export const MotionHintSchema = z.enum([
  'static',
  'slow_zoom_in',
  'slow_zoom_out',
  'slow_pan_left',
  'slow_pan_right',
  'subtle_shake',
]);

export const GptImageParamsSchema = z.object({
  style_suffix: z.string().optional(),
  mood: z.string().optional(),
  lighting: z.string().optional(),
});

export const ShotSchema = z.object({
  shot_id: z.string(),
  sequence: z.number(),
  beat_reference: z.string(),
  timestamp_anchor: z.string().optional(),
  shot_type: ShotTypeSchema,
  visual_prompt: z.string(),
  gpt_image_params: GptImageParamsSchema.optional(),
  motion_hint: MotionHintSchema.default('slow_zoom_in'),
});

export const StoryboardSchema = z.object({
  scene_id: z.string(),
  shot_count: z.number(),
  shots: z.array(ShotSchema),
});

export const EpisodeStoryboardSchema = z.object({
  episode_id: z.string(),
  scenes: z.array(StoryboardSchema),
  total_shots: z.number(),
});

export type ShotType = z.infer<typeof ShotTypeSchema>;
export type MotionHint = z.infer<typeof MotionHintSchema>;
export type GptImageParams = z.infer<typeof GptImageParamsSchema>;
export type Shot = z.infer<typeof ShotSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type EpisodeStoryboard = z.infer<typeof EpisodeStoryboardSchema>;

// ============================================================================
// Production Manifest (E.9)
// ============================================================================

export const MotionEffectSchema = z.object({
  type: MotionHintSchema,
  start_scale: z.number().optional(),
  end_scale: z.number().optional(),
  pan_distance_percent: z.number().optional(),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).default('ease_in_out'),
});

export const ProductionShotSchema = z.object({
  shot_id: z.string(),
  image_file: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
  motion: MotionEffectSchema.optional(),
});

export const ProductionSceneSchema = z.object({
  scene_id: z.string(),
  audio_track: z.string(),
  duration_ms: z.number(),
  shots: z.array(ProductionShotSchema),
});

export const VideoSettingsSchema = z.object({
  resolution: z.string().default('1920x1080'),
  fps: z.number().default(24),
  codec: z.string().default('h264'),
  audio_codec: z.string().default('aac'),
  audio_bitrate: z.string().default('192k'),
});

export const ProductionManifestSchema = z.object({
  episode_id: z.string(),
  video_settings: VideoSettingsSchema,
  scenes: z.array(ProductionSceneSchema),
  total_duration_ms: z.number().optional(),
});

export type MotionEffect = z.infer<typeof MotionEffectSchema>;
export type ProductionShot = z.infer<typeof ProductionShotSchema>;
export type ProductionScene = z.infer<typeof ProductionSceneSchema>;
export type VideoSettings = z.infer<typeof VideoSettingsSchema>;
export type ProductionManifest = z.infer<typeof ProductionManifestSchema>;

// ============================================================================
// Production Constraints (from constraints.json)
// ============================================================================

export const ProductionConstraintsSchema = z.object({
  visual_style_prompt: z.string(),
  aspect_ratio: z.string().default('16:9'),
  resolution: z.string().default('1920x1080'),
  image_format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  default_visual_cadence: z.number().default(0.4),
});

export type ProductionConstraints = z.infer<typeof ProductionConstraintsSchema>;

// ============================================================================
// Visual DNA (from characters.json and world.json)
// ============================================================================

export const CharacterVisualDNASchema = z.object({
  physical: z.string(),
  costume_default: z.string(),
  distinguishing_marks: z.string().optional(),
  posture_energy: z.string().optional(),
});

export const LocationVisualDNASchema = z.object({
  architecture: z.string(),
  lighting_default: z.string(),
  atmosphere: z.string(),
  key_props: z.array(z.string()).optional(),
});

export type CharacterVisualDNA = z.infer<typeof CharacterVisualDNASchema>;
export type LocationVisualDNA = z.infer<typeof LocationVisualDNASchema>;

// ============================================================================
// Review Queue (E.14)
// ============================================================================

export const ReviewItemSchema = z.object({
  type: z.enum(['voice_assignment', 'image_failure', 'audio_content_flag']),
  character_id: z.string().optional(),
  shot_id: z.string().optional(),
  turn_id: z.string().optional(),
  reason: z.string(),
  blocking: z.boolean(),
  placeholder_used: z.boolean().optional(),
});

export const ReviewQueueSchema = z.object({
  review_queue: z.array(ReviewItemSchema),
});

export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type ReviewQueue = z.infer<typeof ReviewQueueSchema>;

// ============================================================================
// Production Result
// ============================================================================

export const ProductionResultSchema = z.object({
  success: z.boolean(),
  episode_id: z.string(),
  storyboard: EpisodeStoryboardSchema.optional(),
  manifest: ProductionManifestSchema.optional(),
  audio_files: z.array(z.string()).optional(),
  image_files: z.array(z.string()).optional(),
  video_file: z.string().optional(),
  review_queue: z.array(ReviewItemSchema).optional(),
  errors: z.array(z.string()).optional(),
});

export type ProductionResult = z.infer<typeof ProductionResultSchema>;
