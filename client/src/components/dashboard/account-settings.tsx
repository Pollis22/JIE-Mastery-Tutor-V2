/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Mail, 
  Lock, 
  AlertTriangle, 
  Download, 
  Trash2,
  Save,
  Edit3
} from "lucide-react";

export default function AccountSettings() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const [profileData, setProfileData] = useState({
    parentName: user?.parentName || "",
    studentName: user?.studentName || "",
    studentAge: user?.studentAge || "",
    email: user?.email || "",
    firstName: user?.firstName || "",
    lastName: user?.lastName || ""
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", "/api/user/profile", data);
      if (!response.ok) throw new Error("Failed to update profile");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      setIsEditing(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/user/change-password", data);
      if (!response.ok) throw new Error("Failed to change password");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password changed successfully",
      });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password",
        variant: "destructive",
      });
    }
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }
    
    if (passwordData.newPassword.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }
    
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword
    });
  };

  const handleExportData = async () => {
    try {
      const response = await apiRequest("GET", "/api/user/export-data");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jie-mastery-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Your data has been exported successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      try {
        await apiRequest("DELETE", "/api/user/account");
        toast({
          title: "Account deleted",
          description: "Your account has been successfully deleted",
        });
        window.location.href = "/auth";
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to delete account",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>Manage your account and personal information</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="danger">Danger Zone</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">Profile Information</h3>
              <Button
                variant={isEditing ? "outline" : "default"}
                size="sm"
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? "Cancel" : "Edit Profile"}
                {!isEditing && <Edit3 className="ml-2 h-4 w-4" />}
              </Button>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="parentName">Parent/Guardian Name</Label>
                  <Input
                    id="parentName"
                    value={profileData.parentName}
                    onChange={(e) => setProfileData({...profileData, parentName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-parent-name"
                  />
                </div>

                <div>
                  <Label htmlFor="studentName">Student Name</Label>
                  <Input
                    id="studentName"
                    value={profileData.studentName}
                    onChange={(e) => setProfileData({...profileData, studentName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-student-name"
                  />
                </div>

                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData({...profileData, firstName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-first-name"
                  />
                </div>

                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData({...profileData, lastName: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-last-name"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-email"
                  />
                </div>

                <div>
                  <Label htmlFor="studentAge">Student Age</Label>
                  <Input
                    id="studentAge"
                    type="number"
                    value={profileData.studentAge}
                    onChange={(e) => setProfileData({...profileData, studentAge: e.target.value})}
                    disabled={!isEditing}
                    data-testid="input-student-age"
                  />
                </div>
              </div>

              {isEditing && (
                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  className="w-full md:w-auto"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </form>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <h3 className="text-lg font-medium mb-4">Change Password</h3>
            
            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                  data-testid="input-current-password"
                />
              </div>

              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                  data-testid="input-new-password"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  data-testid="input-confirm-password"
                />
              </div>

              <Button 
                type="submit" 
                disabled={changePasswordMutation.isPending}
              >
                <Lock className="mr-2 h-4 w-4" />
                {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4">
            <h3 className="text-lg font-medium mb-4">Privacy & Data</h3>
            
            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  Your data is securely stored and encrypted. You can export or delete your data at any time.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Export Your Data</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Download all your data including profile information, learning sessions, and progress.
                  </p>
                  <Button variant="outline" onClick={handleExportData}>
                    <Download className="mr-2 h-4 w-4" />
                    Export Data
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="danger" className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                These actions are irreversible. Please proceed with caution.
              </AlertDescription>
            </Alert>

            <div className="p-4 border border-destructive rounded-lg">
              <h4 className="font-medium text-destructive mb-2">Delete Account</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button 
                variant="destructive" 
                onClick={handleDeleteAccount}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}