/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  TrendingDown,
  Clock,
  BookOpen
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface WeeklyData {
  dailyBreakdown: { day: string; minutes: number }[];
  weeklyTotal: number;
  lastWeekTotal: number;
  percentChange: number;
}

export default function UsageAnalytics() {
  const { user } = useAuth();

  // Fetch analytics data - refetch every 30 seconds for real-time updates
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['/api/user/analytics'],
    enabled: !!user,
    refetchInterval: 30000
  });

  // Fetch weekly stats
  const { data: weeklyData, isLoading: weeklyLoading } = useQuery<WeeklyData>({
    queryKey: ['/api/user/usage-weekly'],
    enabled: !!user,
    refetchInterval: 30000
  });

  // Calculate days until reset - handle past dates correctly
  const calculateDaysUntilReset = () => {
    if (!user?.monthlyResetDate && !user?.billingCycleStart) return 30;
    
    const now = new Date();
    let resetDate = new Date(user?.monthlyResetDate || user?.billingCycleStart || now);
    
    // If reset date is in the past, calculate next reset by adding months
    while (resetDate < now) {
      resetDate.setMonth(resetDate.getMonth() + 1);
    }
    
    const daysUntilReset = Math.ceil((resetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, daysUntilReset); // Never return negative
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Analytics</CardTitle>
          <CardDescription>Loading your learning analytics...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-[400px]">
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Analytics</CardTitle>
        <CardDescription>Track your learning progress and patterns</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="weekly">Weekly Stats</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl font-bold" data-testid="text-total-sessions">
                        {analytics?.summary?.totalSessions || 0}
                      </p>
                    </div>
                    <BookOpen className="h-8 w-8 text-primary opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Minutes</p>
                      <p className="text-2xl font-bold" data-testid="text-total-minutes">
                        {Math.round(analytics?.summary?.totalMinutesUsed || 0)}
                      </p>
                    </div>
                    <Clock className="h-8 w-8 text-primary opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg. Session</p>
                      <p className="text-2xl font-bold" data-testid="text-avg-session">
                        {analytics?.summary?.totalSessions 
                          ? Math.round(analytics.summary.totalMinutesUsed / analytics.summary.totalSessions) 
                          : 0} min
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-primary opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Voice Minutes Used</span>
                  <span className="font-medium">
                    {user?.subscriptionMinutesUsed || user?.monthlyVoiceMinutesUsed || 0} / {user?.subscriptionMinutesLimit || user?.monthlyVoiceMinutes || 60}
                  </span>
                </div>
                <Progress 
                  value={(user?.subscriptionMinutesUsed || user?.monthlyVoiceMinutesUsed || 0) / (user?.subscriptionMinutesLimit || user?.monthlyVoiceMinutes || 1) * 100} 
                />
                
                <div className="flex justify-between text-sm">
                  <span>Days Until Reset</span>
                  <span className="font-medium">
                    {calculateDaysUntilReset()} days
                  </span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="weekly" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">This Week's Activity</CardTitle>
                <CardDescription>Your learning activity for the current week</CardDescription>
              </CardHeader>
              <CardContent>
                {weeklyLoading ? (
                  <p className="text-muted-foreground text-center py-8">Loading weekly data...</p>
                ) : (
                  <>
                    {/* Weekly Chart */}
                    <div className="space-y-3">
                      {(weeklyData?.dailyBreakdown || []).map((day) => (
                        <div key={day.day} className="flex items-center gap-3">
                          <span className="w-10 text-sm font-medium">{day.day}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Progress 
                                value={day.minutes * 100 / 60} 
                                className="flex-1 h-6"
                              />
                              <span className="text-sm text-muted-foreground w-16">
                                {day.minutes} min
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Weekly Summary */}
                    <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">Weekly Total</p>
                          <p className="text-2xl font-bold">
                            {weeklyData?.weeklyTotal || 0} minutes
                          </p>
                        </div>
                        {weeklyData && weeklyData.percentChange !== 0 && (
                          <Badge variant={weeklyData.percentChange >= 0 ? "default" : "secondary"}>
                            {weeklyData.percentChange >= 0 ? (
                              <TrendingUp className="mr-1 h-3 w-3" />
                            ) : (
                              <TrendingDown className="mr-1 h-3 w-3" />
                            )}
                            {weeklyData.percentChange >= 0 ? '+' : ''}{weeklyData.percentChange}% from last week
                          </Badge>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </CardContent>
    </Card>
  );
}