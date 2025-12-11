import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Mic, Volume2, Play, Square, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AUDIO_PREFS = {
  PREFERRED_MIC_ID: 'jie-preferred-microphone-id',
  PREFERRED_MIC_LABEL: 'jie-preferred-microphone-label',
  PREFERRED_SPEAKER_ID: 'jie-preferred-speaker-id',
  PREFERRED_SPEAKER_LABEL: 'jie-preferred-speaker-label',
  ALLOW_VIRTUAL: 'jie-allow-virtual-audio',
};

const VIRTUAL_PATTERNS = ['stereo mix', 'virtual', 'cable', 'loopback', 'what u hear', 'wave out'];

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export function AudioSettings() {
  const { toast } = useToast();
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [speakers, setSpeakers] = useState<AudioDevice[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>('system-default');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('system-default');
  const [allowVirtual, setAllowVirtual] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'recording' | 'playing' | 'success' | 'error'>('idle');
  const [speakerSupported, setSpeakerSupported] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const loadSavedPreferences = useCallback(() => {
    try {
      const savedMicId = localStorage.getItem(AUDIO_PREFS.PREFERRED_MIC_ID);
      const savedSpeakerId = localStorage.getItem(AUDIO_PREFS.PREFERRED_SPEAKER_ID);
      const savedAllowVirtual = localStorage.getItem(AUDIO_PREFS.ALLOW_VIRTUAL) === 'true';
      
      if (savedMicId) setSelectedMic(savedMicId);
      if (savedSpeakerId) setSelectedSpeaker(savedSpeakerId);
      setAllowVirtual(savedAllowVirtual);
    } catch (e) {
      console.error('[AudioSettings] Error loading preferences:', e);
    }
  }, []);

  const savePreference = useCallback((key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('[AudioSettings] Error saving preference:', e);
    }
  }, []);

  const getAudioDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionGranted(true);
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .filter(d => {
          if (allowVirtual) return true;
          const label = d.label.toLowerCase();
          return !VIRTUAL_PATTERNS.some(p => label.includes(p));
        })
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));
      
      const spks = devices
        .filter(d => d.kind === 'audiooutput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));
      
      setMicrophones(mics);
      setSpeakers(spks);
      
      const audio = new Audio();
      setSpeakerSupported('setSinkId' in audio);
      
    } catch (error) {
      console.error('[AudioSettings] Error getting devices:', error);
      setPermissionGranted(false);
      toast({
        title: "Microphone Permission Required",
        description: "Please allow microphone access to see available audio devices.",
        variant: "destructive",
      });
    }
  }, [allowVirtual, toast]);

  useEffect(() => {
    loadSavedPreferences();
  }, [loadSavedPreferences]);

  useEffect(() => {
    getAudioDevices();
  }, [getAudioDevices]);

  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', getAudioDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getAudioDevices);
    };
  }, [getAudioDevices]);

  const handleMicChange = (value: string) => {
    setSelectedMic(value);
    
    if (value === 'system-default') {
      localStorage.removeItem(AUDIO_PREFS.PREFERRED_MIC_ID);
      localStorage.removeItem(AUDIO_PREFS.PREFERRED_MIC_LABEL);
    } else {
      savePreference(AUDIO_PREFS.PREFERRED_MIC_ID, value);
      const device = microphones.find(m => m.deviceId === value);
      if (device) {
        savePreference(AUDIO_PREFS.PREFERRED_MIC_LABEL, device.label);
      }
    }
    
    toast({
      title: "Microphone Updated",
      description: value === 'system-default' 
        ? "Using system default microphone" 
        : `Selected: ${microphones.find(m => m.deviceId === value)?.label}`,
    });
  };

  const handleSpeakerChange = (value: string) => {
    setSelectedSpeaker(value);
    
    if (value === 'system-default') {
      localStorage.removeItem(AUDIO_PREFS.PREFERRED_SPEAKER_ID);
      localStorage.removeItem(AUDIO_PREFS.PREFERRED_SPEAKER_LABEL);
    } else {
      savePreference(AUDIO_PREFS.PREFERRED_SPEAKER_ID, value);
      const device = speakers.find(s => s.deviceId === value);
      if (device) {
        savePreference(AUDIO_PREFS.PREFERRED_SPEAKER_LABEL, device.label);
      }
    }
    
    toast({
      title: "Speaker Updated",
      description: value === 'system-default'
        ? "Using system default speaker"
        : `Selected: ${speakers.find(s => s.deviceId === value)?.label}`,
    });
  };

  const handleVirtualToggle = (checked: boolean) => {
    setAllowVirtual(checked);
    savePreference(AUDIO_PREFS.ALLOW_VIRTUAL, checked.toString());
    getAudioDevices();
  };

  const stopMicTest = useCallback(() => {
    try {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      // CRITICAL: Stop MediaRecorder BEFORE stopping tracks to avoid InvalidStateError
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.warn('[AudioSettings] MediaRecorder stop error:', e);
        }
      }
      
      // Stop tracks after recorder is stopped
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    } catch (e) {
      console.warn('[AudioSettings] Error during mic test cleanup:', e);
    }
    
    setMicLevel(0);
    setIsTesting(false);
    setTestStatus('idle');
  }, []);

  const testMicrophone = async () => {
    if (isTesting) {
      stopMicTest();
      return;
    }

    try {
      setIsTesting(true);
      setTestStatus('recording');

      const constraints: MediaStreamConstraints = {
        audio: selectedMic !== 'system-default' 
          ? { deviceId: { exact: selectedMic } }
          : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicLevel(Math.min(100, (average / 128) * 100));
        animationRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        setTestStatus('playing');
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          
          audio.onended = () => {
            setTestStatus('success');
            URL.revokeObjectURL(audioUrl);
            setTimeout(() => {
              stopMicTest();
            }, 2000);
          };
          
          audio.onerror = () => {
            setTestStatus('error');
            setTimeout(stopMicTest, 2000);
          };
          
          audio.play().catch(() => {
            setTestStatus('error');
            setTimeout(stopMicTest, 2000);
          });
        } else {
          setTestStatus('error');
          setTimeout(stopMicTest, 2000);
        }
      };

      mediaRecorder.start();
      
      setTimeout(() => {
        try {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
          setTimeout(() => {
            if (mediaStreamRef.current) {
              mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
          }, 100);
        } catch (e) {
          console.warn('[AudioSettings] Error during mic test cleanup:', e);
        }
      }, 3000);

    } catch (error) {
      console.error('[AudioSettings] Mic test error:', error);
      setTestStatus('error');
      toast({
        title: "Microphone Test Failed",
        description: error instanceof Error ? error.message : "Could not access microphone",
        variant: "destructive",
      });
      setTimeout(stopMicTest, 2000);
    }
  };

  const testSpeaker = async () => {
    try {
      const audio = new Audio('/sounds/test-chime.mp3');
      
      if (selectedSpeaker !== 'system-default' && 'setSinkId' in audio) {
        try {
          await (audio as any).setSinkId(selectedSpeaker);
        } catch (e) {
          console.warn('[AudioSettings] Could not set speaker:', e);
        }
      }
      
      await audio.play();
      
      toast({
        title: "Speaker Test",
        description: "Playing test sound...",
      });
    } catch (error) {
      console.error('[AudioSettings] Speaker test error:', error);
      
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance("Audio test successful");
      utterance.rate = 1;
      utterance.pitch = 1;
      synth.speak(utterance);
      
      toast({
        title: "Speaker Test",
        description: "Using speech synthesis for test...",
      });
    }
  };

  const getTestButtonText = () => {
    switch (testStatus) {
      case 'recording': return 'Recording... (3s)';
      case 'playing': return 'Playing back...';
      case 'success': return 'Test Passed!';
      case 'error': return 'Test Failed';
      default: return isTesting ? 'Stop Test' : 'Test Microphone';
    }
  };

  const getTestButtonIcon = () => {
    switch (testStatus) {
      case 'recording':
      case 'playing':
        return <Square className="w-4 h-4 mr-2" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 mr-2 text-red-500" />;
      default:
        return <Mic className="w-4 h-4 mr-2" />;
    }
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Audio Device Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!permissionGranted && (
          <div className="flex items-start gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Microphone Permission Required</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Click "Test Microphone" to grant permission and see available devices.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="microphone-select" className="text-base font-medium">
              Microphone
            </Label>
            <div className="flex gap-3">
              <Select value={selectedMic} onValueChange={handleMicChange}>
                <SelectTrigger className="flex-1" id="microphone-select" data-testid="select-microphone">
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system-default">System Default</SelectItem>
                  {microphones.map((mic) => (
                    <SelectItem key={mic.deviceId} value={mic.deviceId}>
                      {mic.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant={isTesting ? "destructive" : "outline"}
                onClick={testMicrophone}
                disabled={testStatus === 'playing'}
                data-testid="button-test-microphone"
              >
                {getTestButtonIcon()}
                {getTestButtonText()}
              </Button>
            </div>
          </div>

          {(isTesting || testStatus !== 'idle') && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                {testStatus === 'recording' ? 'Speak now...' : testStatus === 'playing' ? 'Playing back...' : 'Microphone Level'}
              </Label>
              <Progress 
                value={micLevel} 
                className="h-3"
                data-testid="progress-mic-level"
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="speaker-select" className="text-base font-medium">
            Speaker / Output
          </Label>
          {!speakerSupported ? (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Info className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Speaker selection is not supported in this browser (Safari)
              </span>
            </div>
          ) : (
            <div className="flex gap-3">
              <Select value={selectedSpeaker} onValueChange={handleSpeakerChange}>
                <SelectTrigger className="flex-1" id="speaker-select" data-testid="select-speaker">
                  <SelectValue placeholder="Select speaker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system-default">System Default</SelectItem>
                  {speakers.map((spk) => (
                    <SelectItem key={spk.deviceId} value={spk.deviceId}>
                      {spk.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline"
                onClick={testSpeaker}
                data-testid="button-test-speaker"
              >
                <Play className="w-4 h-4 mr-2" />
                Test Speaker
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="virtual-toggle" className="text-base font-medium cursor-pointer">
              Show virtual audio devices
            </Label>
            <p className="text-sm text-muted-foreground">
              Enable if you use Voicemeeter, OBS, VB-Cable, or similar
            </p>
          </div>
          <Switch
            id="virtual-toggle"
            checked={allowVirtual}
            onCheckedChange={handleVirtualToggle}
            data-testid="switch-virtual-audio"
          />
        </div>

        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-200">Tip</p>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              If you're having audio issues, try selecting your specific device instead of System Default.
              Your preferences are automatically saved and will be used in your next tutoring session.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
