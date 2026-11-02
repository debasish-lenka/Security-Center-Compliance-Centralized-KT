import { useMemo } from 'react';
import { create } from 'zustand';

interface WatermarkConfig {
  enabled: boolean;
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
  spacing: number;
  position: 'diagonal' | 'horizontal' | 'vertical';
  userInfo?: {
    userId: string;
    userName: string;
    userEmail: string;
    timestamp: string;
  };
}

interface WatermarkStore {
  config: WatermarkConfig;
  setConfig: (config: Partial<WatermarkConfig>) => void;
  generateWatermarkCanvas: (width: number, height: number) => HTMLCanvasElement;
}

const defaultConfig: WatermarkConfig = {
  enabled: true,
  text: 'CONFIDENTIAL',
  fontSize: 24,
  opacity: 0.15,
  rotation: -45,
  color: '#666666',
  spacing: 200,
  position: 'diagonal',
};

export const useWatermarkStore = create<WatermarkStore>((set, get) => ({
  config: defaultConfig,
  setConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),
  generateWatermarkCanvas: (width: number, height: number) => {
    const { config } = get();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.save();
    ctx.globalAlpha = config.opacity;
    ctx.fillStyle = config.color;
    ctx.font = `${config.fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = config.userInfo
      ? `${config.text} - ${config.userInfo.userName} (${config.userInfo.userEmail}) - ${config.userInfo.timestamp}`
      : config.text;

    const textWidth = ctx.measureText(text).width;
    const textHeight = config.fontSize;

    const spacing = config.spacing + textWidth;

    if (config.position === 'diagonal') {
      // Diagonal pattern
      const diagonalSpacing = Math.sqrt(spacing * spacing * 2);
      for (let x = -width; x < width * 2; x += diagonalSpacing) {
        for (let y = -height; y < height * 2; y += diagonalSpacing) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((config.rotation * Math.PI) / 180);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    } else if (config.position === 'horizontal') {
      // Horizontal pattern
      for (let y = 0; y < height; y += spacing) {
        for (let x = 0; x < width; x += spacing) {
          ctx.fillText(text, x + textWidth / 2, y + textHeight / 2);
        }
      }
    } else if (config.position === 'vertical') {
      // Vertical pattern
      for (let x = 0; x < width; x += spacing) {
        for (let y = 0; y < height; y += spacing) {
          ctx.save();
          ctx.translate(x + textWidth / 2, y + textHeight / 2);
          ctx.rotate((90 * Math.PI) / 180);
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
    }

    ctx.restore();
    return canvas;
  },
}));

export function WatermarkOverlay({
  config,
  className = '',
  style = {},
}: {
  config?: Partial<WatermarkConfig>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { config: storeConfig, generateWatermarkCanvas } = useWatermarkStore();
  const mergedConfig = useMemo(() => ({ ...storeConfig, ...config }), [storeConfig, config]);

  const canvas = useMemo(() => {
    if (!mergedConfig.enabled) return null;
    // Generate a tileable pattern canvas
    const patternSize = 300;
    return generateWatermarkCanvas(patternSize, patternSize);
  }, [mergedConfig, generateWatermarkCanvas]);

  if (!mergedConfig.enabled || !canvas) return null;

  const patternDataUrl = canvas.toDataURL('image/png');

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-50 ${className}`}
      style={{
        backgroundImage: `url(${patternDataUrl})`,
        backgroundRepeat: 'repeat',
        backgroundSize: '300px 300px',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function DocumentWatermark({
  documentId,
  userName,
  userEmail,
  config: overrideConfig,
}: {
  documentId: string;
  userName: string;
  userEmail: string;
  config?: Partial<WatermarkConfig>;
}) {
  const { setConfig } = useWatermarkStore();

  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  useMemo(() => {
    setConfig({
      ...overrideConfig,
      userInfo: {
        userId: documentId,
        userName,
        userEmail,
        timestamp,
      },
    });
  }, [documentId, userName, userEmail, timestamp, setConfig, overrideConfig]);

  return <WatermarkOverlay config={overrideConfig} />;
}

export function createWatermarkConfig(document: {
  id: string;
  name: string;
  watermarkConfig?: WatermarkConfig;
}): WatermarkConfig {
  return {
    ...defaultConfig,
    ...document.watermarkConfig,
    enabled: document.watermarkConfig?.enabled ?? true,
    text: document.watermarkConfig?.text || 'CONFIDENTIAL',
  };
}