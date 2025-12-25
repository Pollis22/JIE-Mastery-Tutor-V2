import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  User, 
  Mail, 
  CreditCard, 
  Clock, 
  FileText,
  Calendar,
  Shield,
  BookOpen
} from "lucide-react";

interface UserDetails {
  user: {
    id: string;
    username: string;
    email: string;
    studentName?: string;
    gradeLevel?: string;
    subscriptionPlan?: string;
    subscriptionStatus?: string;
    subscriptionMinutesLimit?: number;
    subscriptionMinutesUsed?: number;
    purchasedMinutesBalance?: number;
    createdAt: string;
    emailVerified?: boolean;
    isAdmin?: boolean;
  };
  stats: {
    totalSessions: number;
    totalMinutes: number;
    documentsCount: number;
  };
  recentSessions: Array<{
    id: string;
    studentName?: string;
    subject?: string;
    ageGroup?: string;
    language?: string;
    minutesUsed?: number;
    startedAt: string;
    endedAt?: string;
    status: string;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    createdAt: string;
  }>;
}

export default function AdminUserDetail() {
  const params = useParams();
  const userId = params.userId;

  const { data, isLoading, error } = useQuery<UserDetails>({
    queryKey: ["/api/admin/users", userId],
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Link href="/admin/users">
            <Button variant="ghost" className="gap-2" data-testid="button-back-to-users">
              <ArrowLeft className="w-4 h-4" />
              Back to Users
            </Button>
          </Link>
          <Card>
            <CardContent className="pt-6">
              <p className="text-destructive">User not found or error loading user details.</p>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const { user, stats, recentSessions, documents } = data;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/users">
              <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-to-users">
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
            </Link>
            <div>
              <h2 className="text-3xl font-bold text-foreground">{user.username}</h2>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {user.isAdmin && (
              <Badge variant="secondary">Admin</Badge>
            )}
            {user.emailVerified ? (
              <Badge variant="default">Email Verified</Badge>
            ) : (
              <Badge variant="outline">Email Unverified</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Total Sessions</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-sessions">{stats.totalSessions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-sm">Total Minutes</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-total-minutes">{stats.totalMinutes}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-sm">Documents</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-documents-count">{stats.documentsCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Member Since</span>
              </div>
              <p className="text-lg font-medium" data-testid="text-created-at">
                {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Username</p>
                  <p className="font-medium" data-testid="text-username">{user.username}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium" data-testid="text-email">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Student Name</p>
                  <p className="font-medium" data-testid="text-student-name">{user.studentName || "Not set"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Grade Level</p>
                  <p className="font-medium" data-testid="text-grade-level">{user.gradeLevel || "Not set"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Subscription Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Plan</p>
                  <Badge 
                    variant={user.subscriptionStatus === "active" ? "default" : "secondary"}
                    className="mt-1"
                    data-testid="badge-subscription-plan"
                  >
                    {user.subscriptionPlan || "None"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge 
                    variant={user.subscriptionStatus === "active" ? "default" : "outline"}
                    className="mt-1"
                    data-testid="badge-subscription-status"
                  >
                    {user.subscriptionStatus || "Inactive"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Minutes</p>
                  <p className="font-medium" data-testid="text-monthly-minutes">
                    {user.subscriptionMinutesUsed || 0} / {user.subscriptionMinutesLimit || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Purchased Minutes</p>
                  <p className="font-medium" data-testid="text-purchased-minutes">
                    {user.purchasedMinutesBalance || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Recent Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No sessions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Student</th>
                      <th className="text-left p-3 font-semibold">Subject</th>
                      <th className="text-left p-3 font-semibold">Age Group</th>
                      <th className="text-left p-3 font-semibold">Minutes</th>
                      <th className="text-left p-3 font-semibold">Date</th>
                      <th className="text-left p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSessions.map((session) => (
                      <tr key={session.id} className="border-b hover:bg-muted/50" data-testid={`row-session-${session.id}`}>
                        <td className="p-3">{session.studentName || "Unknown"}</td>
                        <td className="p-3 capitalize">{session.subject || "N/A"}</td>
                        <td className="p-3">{session.ageGroup || "N/A"}</td>
                        <td className="p-3">{session.minutesUsed || 0}</td>
                        <td className="p-3">
                          {new Date(session.startedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <Badge variant={session.status === "ended" ? "default" : "secondary"}>
                            {session.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Uploaded Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div 
                    key={doc.id} 
                    className="flex items-center justify-between p-3 rounded-lg border"
                    data-testid={`row-document-${doc.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span>{doc.fileName}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
