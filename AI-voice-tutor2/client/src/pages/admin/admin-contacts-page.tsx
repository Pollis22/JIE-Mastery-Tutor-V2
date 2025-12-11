import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Users, Mail, Clock, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface ContactSegment {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
}

interface MarketingCampaign {
  id: number;
  campaignName: string;
  segment: string;
  contactCount: number;
  exportedAt: string;
  adminId: string;
}

interface SegmentPreview {
  count: number;
  preview: Array<{
    id: string;
    username: string;
    email: string;
    parentName: string | null;
    studentName: string | null;
    gradeLevel: string | null;
    subscriptionStatus: string | null;
    subscriptionPlan: string | null;
  }>;
}

const SEGMENTS: ContactSegment[] = [
  {
    id: "all",
    name: "All Users (Opted-In)",
    description: "All users who opted in to marketing communications",
    icon: Users,
    color: "blue",
  },
  {
    id: "free-users",
    name: "Free Users",
    description: "Users who never subscribed to a paid plan",
    icon: Mail,
    color: "gray",
  },
  {
    id: "cancelled",
    name: "Cancelled Subscriptions",
    description: "Users who previously subscribed but cancelled",
    icon: TrendingUp,
    color: "orange",
  },
  {
    id: "inactive-30",
    name: "Inactive 30+ Days",
    description: "Users inactive for more than 30 days",
    icon: Clock,
    color: "yellow",
  },
  {
    id: "active-premium",
    name: "Active Premium",
    description: "Active Standard or Pro plan subscribers",
    icon: Users,
    color: "green",
  },
];

export default function AdminContactsPage() {
  const [loadingSegment, setLoadingSegment] = useState<string | null>(null);
  const [previewSegment, setPreviewSegment] = useState<string | null>(null);
  
  const { data: campaigns, isLoading: loadingCampaigns } = useQuery<{ campaigns: MarketingCampaign[]; total: number }>({
    queryKey: ["/api/admin/campaigns"],
  });
  
  const { data: segmentPreview, isLoading: loadingPreview } = useQuery<SegmentPreview>({
    queryKey: ["/api/admin/contacts/preview", previewSegment],
    enabled: !!previewSegment,
  });
  
  const handleExport = async (segment: string) => {
    try {
      setLoadingSegment(segment);
      const response = await fetch(`/api/admin/contacts/export/${segment}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error("Failed to export contacts");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${segment}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      window.location.reload();
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export contacts. Please try again.");
    } finally {
      setLoadingSegment(null);
    }
  };
  
  const handlePreview = (segment: string) => {
    setPreviewSegment(segment === previewSegment ? null : segment);
  };
  
  const getSegmentColor = (segment: string) => {
    const seg = SEGMENTS.find(s => s.id === segment);
    return seg?.color || "blue";
  };
  
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2" data-testid="heading-contacts">
          Contact Management
        </h1>
        <p className="text-muted-foreground">
          Export contact lists for marketing campaigns and email communications
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SEGMENTS.map((segment) => {
          const Icon = segment.icon;
          return (
            <Card key={segment.id} data-testid={`card-segment-${segment.id}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <Badge variant={segment.color as any} data-testid={`badge-${segment.id}`}>
                    {segment.id}
                  </Badge>
                </div>
                <CardTitle className="text-lg" data-testid={`title-${segment.id}`}>
                  {segment.name}
                </CardTitle>
                <CardDescription data-testid={`desc-${segment.id}`}>
                  {segment.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleExport(segment.id)}
                    disabled={loadingSegment === segment.id}
                    className="flex-1"
                    data-testid={`button-export-${segment.id}`}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {loadingSegment === segment.id ? "Exporting..." : "Export CSV"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handlePreview(segment.id)}
                    data-testid={`button-preview-${segment.id}`}
                  >
                    {previewSegment === segment.id ? "Hide" : "Preview"}
                  </Button>
                </div>
                
                {previewSegment === segment.id && (
                  <div className="mt-4 border rounded-lg p-3">
                    {loadingPreview ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ) : segmentPreview ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium" data-testid={`count-${segment.id}`}>
                          Total: {segmentPreview.count} contacts
                        </p>
                        <div className="space-y-1 text-xs">
                          {segmentPreview.preview.slice(0, 5).map((contact, i) => (
                            <div key={contact.id} className="flex justify-between border-b pb-1" data-testid={`preview-${segment.id}-${i}`}>
                              <span className="truncate">{contact.email}</span>
                              <Badge variant="outline" className="text-xs">
                                {contact.subscriptionPlan || 'Free'}
                              </Badge>
                            </div>
                          ))}
                          {segmentPreview.count > 5 && (
                            <p className="text-muted-foreground pt-1">
                              +{segmentPreview.count - 5} more...
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle data-testid="heading-history">Export History</CardTitle>
          <CardDescription>
            Recent contact list exports and marketing campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCampaigns ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : campaigns && campaigns.campaigns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-campaign">Campaign Name</TableHead>
                  <TableHead data-testid="header-segment">Segment</TableHead>
                  <TableHead data-testid="header-contacts">Contacts</TableHead>
                  <TableHead data-testid="header-exported">Exported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.campaigns.map((campaign, index) => (
                  <TableRow key={campaign.id} data-testid={`row-campaign-${index}`}>
                    <TableCell className="font-medium" data-testid={`name-${index}`}>
                      {campaign.campaignName}
                    </TableCell>
                    <TableCell data-testid={`segment-${index}`}>
                      <Badge variant={getSegmentColor(campaign.segment) as any}>
                        {campaign.segment}
                      </Badge>
                    </TableCell>
                    <TableCell data-testid={`count-${index}`}>
                      {campaign.contactCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`time-${index}`}>
                      {formatDistanceToNow(new Date(campaign.exportedAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8" data-testid="text-no-exports">
              No exports yet. Start by exporting a contact segment above.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
