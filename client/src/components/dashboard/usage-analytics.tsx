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
  BarChart3, 
  TrendingUp, 
  Clock,
  Calendar,
  Target,
  BookOpen,
  Mic
} from "lucide-react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

export default function UsageAnalytics() {
  const { user } = useAuth();

  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['/api/user/analytics'],
    enabled: !!user
  });

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

  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date())
  });

  // Mock data for visualization (in production, this would come from the API)
  const weeklyData = weekDays.map(day => ({
    day: format(day, 'EEE'),
    minutes: Math.floor(Math.random() * 60),
    sessions: Math.floor(Math.random() * 3)
  }));

  const subjectDistribution = [
    { subject: "Math", percentage: 40, color: "bg-blue-500" },
    { subject: "English", percentage: 30, color: "bg-green-500" },
    { subject: "Science", percentage: 20, color: "bg-purple-500" },
    { subject: "Spanish", percentage: 10, color: "bg-yellow-500" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Analytics</CardTitle>
        <CardDescription>Track your learning progress and patterns</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="weekly">Weekly Stats</TabsTrigger>
            <TabsTrigger value="subjects">Subjects</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl font-bold">{analytics?.total_sessions || 0}</p>
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
                      <p className="text-2xl font-bold">{analytics?.total_minutes_used || 0}</p>
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
                      <p className="text-2xl font-bold">
                        {analytics?.total_sessions 
                          ? Math.round(analytics.total_minutes_used / analytics.total_sessions) 
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
                    {user?.monthlyResetDate 
                      ? Math.ceil((new Date(user.monthlyResetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : 0} days
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
                {/* Weekly Chart */}
                <div className="space-y-3">
                  {weeklyData.map((day) => (
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
                        {weeklyData.reduce((sum, day) => sum + day.minutes, 0)} minutes
                      </p>
                    </div>
                    <Badge variant="default">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      +15% from last week
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subjects" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Subject Distribution</CardTitle>
                <CardDescription>Time spent on each subject</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Subject Distribution */}
                <div className="space-y-4">
                  {subjectDistribution.map((subject) => (
                    <div key={subject.subject} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{subject.subject}</span>
                        <span className="text-sm text-muted-foreground">{subject.percentage}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div 
                          className={`${subject.color} h-2 rounded-full transition-all`}
                          style={{ width: `${subject.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Learning Goals */}
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-3">Learning Goals</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 border rounded">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Complete 20 sessions this month</span>
                      <Badge variant="outline" className="ml-auto">
                        15/20
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 p-2 border rounded">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Practice Math 3x per week</span>
                      <Badge variant="default" className="ml-auto">
                        Achieved
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}