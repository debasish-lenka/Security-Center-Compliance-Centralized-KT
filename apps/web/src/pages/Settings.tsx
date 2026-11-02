import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { toast } from '@/hooks/use-toast';
import { Sun, Moon, Globe, Save, Loader2 } from 'lucide-react';

const themes = [
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Globe },
];

const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

const notificationTypes = [
  { key: 'emailNotifications', label: 'Email Notifications', description: 'Receive email notifications for important events' },
  { key: 'pushNotifications', label: 'Push Notifications', description: 'Receive push notifications in the browser' },
  { key: 'projectUpdates', label: 'Project Updates', description: 'Notify me about project status changes' },
  { key: 'ktReportReminders', label: 'KT Report Reminders', description: 'Remind me to submit daily KT reports' },
  { key: 'deadlineWarnings', label: 'Deadline Warnings', description: 'Warn me about upcoming deadlines' },
  { key: 'complianceAlerts', label: 'Compliance Alerts', description: 'Alert me about compliance issues' },
  { key: 'securityAlerts', label: 'Security Alerts', description: 'Notify me about security events' },
  { key: 'weeklyDigest', label: 'Weekly Digest', description: 'Receive a weekly summary of activity' },
];

export function Settings() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [language, setLanguage] = useState('en');
  const [timezone, setTimezone] = useState('America/New_York');
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(30);

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    department: user?.department || '',
    bio: '',
    phone: '',
    location: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleThemeChange = (value: string) => {
    const validThemes: ('dark' | 'light' | 'system')[] = ['dark', 'light', 'system'];
    if (validThemes.includes(value as 'dark' | 'light' | 'system')) {
      setTheme(value as 'dark' | 'light' | 'system');
      toast({ title: 'Theme updated', description: `Switched to ${value} mode` });
    }
  };

  const handleSave = async (section: string) => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 1000));

    if (section === 'profile') {
      const updatedUser = { ...user, ...profileForm };
      localStorage.setItem('dbi-user', JSON.stringify(updatedUser));
      await refreshUser();
      toast({ title: 'Profile saved', description: 'Your profile has been updated' });
    } else if (section === 'security') {
      toast({ title: 'Security settings saved', description: 'Your security preferences have been updated' });
    } else if (section === 'application') {
      localStorage.setItem('dbi-language', language);
      localStorage.setItem('dbi-timezone', timezone);
      toast({ title: 'Preferences saved', description: 'Your application preferences have been updated' });
    } else if (section === 'notifications') {
      localStorage.setItem('dbi-notifications', JSON.stringify(notifications));
      toast({ title: 'Notifications saved', description: 'Your notification preferences have been updated' });
    } else if (section === 'theme') {
      toast({ title: 'Theme saved', description: 'Your theme preference has been saved' });
    }
    setIsSaving(false);
  };

  const handleNotificationChange = (key: string, checked: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: checked }));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-dbi-textPrimary">Settings</h1>
        <p className="text-dbi-textSecondary">Manage your account, preferences, and application settings</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="theme">Appearance</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information and contact details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="bg-dbi-cyan/20 text-dbi-cyan text-2xl font-medium">
                    {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-medium text-dbi-textPrimary">{user?.fullName}</h3>
                  <p className="text-dbi-textSecondary">{user?.email}</p>
                  <p className="text-sm text-dbi-textSecondary capitalize">{user?.role?.toLowerCase?.().replace('_', ' ')}</p>
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={profileForm.fullName} onChange={e => setProfileForm(prev => ({ ...prev, fullName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={profileForm.email} onChange={e => setProfileForm(prev => ({ ...prev, email: e.target.value }))} disabled />
                  <p className="text-xs text-dbi-textSecondary">Email cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input id="department" value={profileForm.department} onChange={e => setProfileForm(prev => ({ ...prev, department: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" value={profileForm.phone} onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" placeholder="City, Country" value={profileForm.location} onChange={e => setProfileForm(prev => ({ ...prev, location: e.target.value }))} />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Input id="bio" placeholder="Tell us about yourself..." value={profileForm.bio} onChange={e => setProfileForm(prev => ({ ...prev, bio: e.target.value }))} />
                </div>
              </div>
              <Button onClick={() => handleSave('profile')} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Profile
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))} />
                </div>
              </div>
              <Button variant="outline" onClick={() => handleSave('security')} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="application" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Language & Region</CardTitle>
              <CardDescription>Configure your preferred language and regional settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map(lang => (
                        <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map(tz => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => handleSave('application')} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Preferences
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Display Options</CardTitle>
              <CardDescription>Customize how data is displayed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">Compact Mode</p>
                  <p className="text-sm text-dbi-textSecondary">Reduce spacing for denser information display</p>
                </div>
                <Switch id="compactMode" />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">Show Avatar Initials</p>
                  <p className="text-sm text-dbi-textSecondary">Display initials when avatar image is unavailable</p>
                </div>
                <Switch id="showInitials" defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">Animations</p>
                  <p className="text-sm text-dbi-textSecondary">Enable smooth transitions and animations</p>
                </div>
                <Switch id="animations" defaultChecked />
              </div>
              <Button variant="outline" onClick={() => handleSave('application')} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Display Options
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how and when you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationTypes.map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium text-dbi-textPrimary">{label}</p>
                    <p className="text-sm text-dbi-textSecondary">{description}</p>
                  </div>
                  <Switch
                    id={key}
                    checked={notifications[key] ?? true}
                    onCheckedChange={checked => handleNotificationChange(key, checked)}
                  />
                </div>
              ))}
              <Button onClick={() => handleSave('notifications')} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Notification Preferences
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Channels</CardTitle>
              <CardDescription>Configure delivery channels for notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">Email Channel</p>
                  <p className="text-sm text-dbi-textSecondary">Receive notifications via email</p>
                </div>
                <Switch id="emailChannel" defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">In-App Channel</p>
                  <p className="text-sm text-dbi-textSecondary">Show notifications in the application</p>
                </div>
                <Switch id="inAppChannel" defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">SMS Channel</p>
                  <p className="text-sm text-dbi-textSecondary">Receive critical alerts via SMS</p>
                </div>
                <Switch id="smsChannel" />
              </div>
              <Button variant="outline" onClick={() => handleSave('notifications')} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Channels
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security to your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">Enable 2FA</p>
                  <p className="text-sm text-dbi-textSecondary">Require authenticator app code on login</p>
                </div>
                <Switch
                  id="twoFactor"
                  checked={twoFactorEnabled}
                  onCheckedChange={setTwoFactorEnabled}
                />
              </div>
              {twoFactorEnabled && (
                <div className="space-y-4 p-4 bg-dbi-elevated rounded-lg border border-dbi-border">
                  <p className="text-sm text-dbi-textSecondary">2FA is enabled. Use your authenticator app to generate codes on login.</p>
                  <Button variant="outline" size="sm">View Backup Codes</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Session Management</CardTitle>
              <CardDescription>Control your active sessions and timeout settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                <Select value={sessionTimeout.toString()} onValueChange={v => setSessionTimeout(parseInt(v))}>
                  <SelectTrigger id="sessionTimeout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 30, 60, 120, 240, 480].map(m => (
                      <SelectItem key={m} value={m.toString()}>{m} minutes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline">View Active Sessions</Button>
              <Button variant="destructive" className="w-full">Log Out All Sessions</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Access</CardTitle>
              <CardDescription>Manage API tokens for integrations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-dbi-textPrimary">API Access</p>
                  <p className="text-sm text-dbi-textSecondary">Enable API access for third-party integrations</p>
                </div>
                <Switch id="apiAccess" />
              </div>
              <Button variant="outline">Generate New Token</Button>
            </CardContent>
          </Card>

          <Button onClick={() => handleSave('security')} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save Security Settings
          </Button>
        </TabsContent>

        <TabsContent value="theme" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {themes.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={theme === value ? 'default' : 'outline'}
                    className="h-24 flex-col gap-2"
                    onClick={() => handleThemeChange(value)}
                  >
                    <Icon className="h-8 w-8" />
                    <span className="font-medium">{label}</span>
                    <span className="text-xs text-dbi-textSecondary">
                      {theme === value ? 'Active' : 'Click to select'}
                    </span>
                  </Button>
                ))}
              </div>
              <Separator />
              <p className="text-sm text-dbi-textSecondary">
                <strong>Dark:</strong> Optimized for low-light environments &nbsp;|&nbsp;
                <strong>Light:</strong> Clean and bright interface &nbsp;|&nbsp;
                <strong>System:</strong> Matches your OS preference
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Color Accent</CardTitle>
              <CardDescription>Choose your preferred accent color</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 flex-wrap">
                {['cyan', 'indigo', 'emerald', 'amber', 'rose', 'violet'].map(color => (
                  <Button
                    key={color}
                    variant="outline"
                    className={`h-10 w-10 rounded-full transition-all ${color === 'cyan' ? 'ring-2 ring-dbi-cyan' : ''}`}
                    style={{ backgroundColor: `var(--dbi-${color})` }}
                    onClick={() => toast({ title: 'Accent color', description: `${color} accent selected (demo)` })}
                  />
                ))}
              </div>
              <p className="text-sm text-dbi-textSecondary">Color accent customization coming soon</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Density & Accessibility</CardTitle>
              <CardDescription>Adjust interface density and accessibility options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="density">Interface Density</Label>
                  <Select defaultValue="comfortable" onValueChange={v => toast({ title: 'Density', description: `${v} density selected (demo)` })}>
                    <SelectTrigger id="density">
                      <SelectValue placeholder="Select density" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="comfortable">Comfortable</SelectItem>
                      <SelectItem value="spacious">Spacious</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reducedMotion">Reduce Motion</Label>
                  <Switch id="reducedMotion" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="highContrast">High Contrast</Label>
                  <Switch id="highContrast" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}