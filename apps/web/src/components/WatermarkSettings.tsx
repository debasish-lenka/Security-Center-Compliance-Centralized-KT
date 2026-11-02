import { useState } from 'react';
import { useWatermarkStore } from './WatermarkOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

interface WatermarkSettingsProps {
  documentId?: string;
  documentName?: string;
  userName?: string;
  userEmail?: string;
  onSave?: (config: any) => void;
}

interface WatermarkConfig {
  enabled: boolean;
  text: string;
  fontSize: number;
  opacity: number;
  rotation: number;
  color: string;
  spacing: number;
  position: 'diagonal' | 'horizontal' | 'vertical';
}

export function WatermarkSettings({
  documentName,
  userName = 'Current User',
  userEmail = 'user@example.com',
  onSave,
}: WatermarkSettingsProps) {
  const { config, setConfig } = useWatermarkStore();
  const [localConfig, setLocalConfig] = useState<WatermarkConfig>(config);

  const handleChange = (key: keyof WatermarkConfig, value: any) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    setConfig(newConfig);
  };

  const handleSave = () => {
    if (onSave) {
      onSave(localConfig);
    }
    toast({ title: 'Success', description: 'Watermark settings saved' });
  };

  return (
    <Card className="border-dbi-border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Watermark Settings
          <Badge variant="secondary" className={config.enabled ? 'bg-dbi-success/20 text-dbi-success' : 'bg-dbi-textSecondary/20 text-dbi-textSecondary'}>
            {config.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-3">
          <Checkbox
            id="watermark-enabled"
            checked={localConfig.enabled}
            onCheckedChange={(checked: boolean) => handleChange('enabled', checked)}
          />
          <Label htmlFor="watermark-enabled" className="cursor-pointer font-medium">
            Enable Watermark
          </Label>
        </div>

        <Separator />

        <div className="space-y-4">
          <div>
            <Label htmlFor="watermark-text">Watermark Text</Label>
            <Input
              id="watermark-text"
              value={localConfig.text}
              onChange={(e) => handleChange('text', e.target.value)}
              placeholder="CONFIDENTIAL"
              className="mt-1"
              disabled={!localConfig.enabled}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="watermark-fontSize">Font Size: {localConfig.fontSize}px</Label>
              <Slider
                id="watermark-fontSize"
                value={[localConfig.fontSize]}
                onValueChange={([value]: number[]) => handleChange('fontSize', value)}
                min={12}
                max={48}
                step={2}
                className="mt-1"
                disabled={!localConfig.enabled}
              />
            </div>
            <div>
              <Label htmlFor="watermark-opacity">Opacity: {Math.round(localConfig.opacity * 100)}%</Label>
              <Slider
                id="watermark-opacity"
                value={[localConfig.opacity]}
                onValueChange={([value]: number[]) => handleChange('opacity', value)}
                min={0.05}
                max={0.5}
                step={0.05}
                className="mt-1"
                disabled={!localConfig.enabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="watermark-rotation">Rotation: {localConfig.rotation}°</Label>
              <Slider
                id="watermark-rotation"
                value={[localConfig.rotation]}
                onValueChange={([value]: number[]) => handleChange('rotation', value)}
                min={-90}
                max={90}
                step={15}
                className="mt-1"
                disabled={!localConfig.enabled}
              />
            </div>
            <div>
              <Label htmlFor="watermark-spacing">Spacing: {localConfig.spacing}px</Label>
              <Slider
                id="watermark-spacing"
                value={[localConfig.spacing]}
                onValueChange={([value]: number[]) => handleChange('spacing', value)}
                min={100}
                max={500}
                step={25}
                className="mt-1"
                disabled={!localConfig.enabled}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="watermark-color">Color</Label>
              <Select
                value={localConfig.color}
                onValueChange={(value: string) => handleChange('color', value)}
                disabled={!localConfig.enabled}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="#666666">Gray</SelectItem>
                  <SelectItem value="#000000">Black</SelectItem>
                  <SelectItem value="#FF0000">Red</SelectItem>
                  <SelectItem value="#0000FF">Blue</SelectItem>
                  <SelectItem value="#008000">Green</SelectItem>
                  <SelectItem value="#FFA500">Orange</SelectItem>
                  <SelectItem value="#800080">Purple</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="watermark-position">Pattern</Label>
              <Select
                value={localConfig.position}
                onValueChange={(value: 'diagonal' | 'horizontal' | 'vertical') => handleChange('position', value)}
                disabled={!localConfig.enabled}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diagonal">Diagonal</SelectItem>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="p-3 bg-dbi-elevated rounded-lg">
            <Label className="font-medium">User Information (Auto-generated)</Label>
            <div className="mt-2 space-y-1 text-sm text-dbi-textSecondary">
              <p>User: {userName}</p>
              <p>Email: {userEmail}</p>
              <p>Document: {documentName || 'N/A'}</p>
              <p>Timestamp: {new Date().toLocaleString()}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setLocalConfig(config)}>Reset</Button>
            <Button onClick={handleSave} disabled={!localConfig.enabled}>
              Save Settings
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}