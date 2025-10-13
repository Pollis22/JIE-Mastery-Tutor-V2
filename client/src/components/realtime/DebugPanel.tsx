import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DebugPanelProps {
  transport?: string;
  sessionStatus?: string;
  lastError?: any;
  helloProbeStatus?: string;
  vadEnabled?: boolean;
  modelName?: string;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastEvent?: string;
}

export function DebugPanel({
  transport = 'websocket',
  sessionStatus = 'pending',
  lastError,
  helloProbeStatus = 'not sent',
  vadEnabled = false,
  modelName = 'gpt-4o-realtime-preview',
  connectionStatus = 'disconnected',
  lastEvent
}: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (lastEvent) {
      setEvents(prev => [...prev.slice(-9), lastEvent]);
    }
  }, [lastEvent]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'updated':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <Card className="shadow-lg">
        <CardHeader 
          className="p-3 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Realtime Debug</CardTitle>
              {connectionStatus === 'connected' ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
            </div>
            <Button variant="ghost" size="sm">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>

        {isOpen && (
          <CardContent className="p-3 pt-0 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Transport:</span>
                <Badge variant="outline" className="ml-1">{transport}</Badge>
              </div>
              
              <div>
                <span className="text-muted-foreground">Model:</span>
                <Badge variant="outline" className="ml-1 text-xs">{modelName.split('-').slice(0, 2).join('-')}</Badge>
              </div>

              <div>
                <span className="text-muted-foreground">Session:</span>
                <Badge className={`ml-1 ${getStatusColor(sessionStatus)}`}>
                  {sessionStatus}
                </Badge>
              </div>

              <div>
                <span className="text-muted-foreground">Hello Probe:</span>
                <Badge 
                  variant={helloProbeStatus === 'success' ? 'default' : 'secondary'}
                  className="ml-1"
                >
                  {helloProbeStatus}
                </Badge>
              </div>

              <div>
                <span className="text-muted-foreground">VAD:</span>
                <Badge 
                  variant={vadEnabled ? 'default' : 'secondary'}
                  className="ml-1"
                >
                  {vadEnabled ? 'ON' : 'OFF'}
                </Badge>
              </div>

              <div>
                <span className="text-muted-foreground">Connection:</span>
                <Badge className={`ml-1 ${getStatusColor(connectionStatus)}`}>
                  {connectionStatus}
                </Badge>
              </div>
            </div>

            {lastError && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs">
                <div className="font-semibold text-red-600 dark:text-red-400 mb-1">Last Error:</div>
                <pre className="whitespace-pre-wrap text-red-600 dark:text-red-400 overflow-x-auto">
                  {JSON.stringify(lastError, null, 2)}
                </pre>
              </div>
            )}

            {events.length > 0 && (
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="font-semibold text-xs mb-1">Recent Events:</div>
                <div className="space-y-0.5">
                  {events.map((event, i) => (
                    <div key={i} className="text-xs text-muted-foreground">
                      {event}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}