import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, HardDrive } from "lucide-react";

interface DocumentAnalytics {
  totalDocuments?: number;
  storageUsed?: string;
  avgPerUser?: string;
}

interface DocumentData {
  analytics: DocumentAnalytics;
  documents?: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    username: string;
    createdAt: string;
  }>;
}

export default function AdminDocuments() {
  const { data: documents, isLoading } = useQuery<DocumentData>({
    queryKey: ["/api/admin/documents"],
  });

  const stats = documents?.analytics || {};

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Document Management</h2>
          <p className="text-muted-foreground">Manage uploaded documents across all users</p>
        </div>

        {/* Storage Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Documents</p>
                  <p className="text-2xl font-bold text-foreground mt-2">
                    {stats.totalDocuments || 0}
                  </p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Storage Used</p>
                  <p className="text-2xl font-bold text-foreground mt-2">
                    {stats.storageUsed || "0 MB"}
                  </p>
                </div>
                <div className="bg-purple-100 p-3 rounded-full">
                  <HardDrive className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg per User</p>
                  <p className="text-2xl font-bold text-foreground mt-2">
                    {stats.avgPerUser || "0"}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Documents</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded"></div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Document</th>
                      <th className="text-left p-3 font-semibold">Owner</th>
                      <th className="text-left p-3 font-semibold">Type</th>
                      <th className="text-left p-3 font-semibold">Size</th>
                      <th className="text-left p-3 font-semibold">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents?.documents?.map((doc: any) => (
                      <tr key={doc.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">
                          <p className="font-medium">{doc.filename}</p>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">{doc.ownerEmail}</span>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{doc.mimeType}</Badge>
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{doc.fileSize || "N/A"}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-muted-foreground">
                            {new Date(doc.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    )) || (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No documents found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
