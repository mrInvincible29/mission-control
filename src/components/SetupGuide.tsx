"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SetupGuide() {
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-xl">⚡ Quick Setup Required</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          Convex database is not configured. Follow these steps to get started:
        </p>
        
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">1. Deploy to Convex</div>
            <code className="text-sm bg-background px-2 py-1 rounded">
              cd ~/fast/ws/mission-control && npx convex dev
            </code>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">2. Copy the deployment URL</div>
            <p className="text-sm text-muted-foreground">
              After deployment, copy the URL shown (e.g., https://xxx-xxx-xxx.convex.cloud)
            </p>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">3. Update .env.local</div>
            <code className="text-sm bg-background px-2 py-1 rounded block">
              NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
            </code>
          </div>
          
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">4. Restart the dev server</div>
            <code className="text-sm bg-background px-2 py-1 rounded">
              npm run dev
            </code>
          </div>
        </div>
        
        <p className="text-sm text-muted-foreground pt-2">
          The dashboard will automatically connect once Convex is configured.
        </p>
      </CardContent>
    </Card>
  );
}
