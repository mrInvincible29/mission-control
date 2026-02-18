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
          Supabase is not configured. Follow these steps to get started:
        </p>

        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">1. Create a Supabase project</div>
            <p className="text-sm text-muted-foreground">
              Go to supabase.com and create a new project. Note the project URL and keys.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">2. Run the migration SQL</div>
            <code className="text-sm bg-background px-2 py-1 rounded block">
              Run supabase-migration.sql in the Supabase SQL editor
            </code>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <div className="font-medium mb-1">3. Update .env.local</div>
            <code className="text-sm bg-background px-2 py-1 rounded block whitespace-pre">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...`}
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
          The dashboard will automatically connect once Supabase is configured.
        </p>
      </CardContent>
    </Card>
  );
}
