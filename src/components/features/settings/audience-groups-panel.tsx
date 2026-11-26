"use client";

import * as React from "react";
import { Users, Plus, Trash2, Edit2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { manageAudienceGroupAction } from "@/server/actions/workspace-admin.actions";

export interface AudienceGroupItem {
  id: string;
  name: string;
  groupType: string;
  memberCount: number;
}

export interface AudienceGroupsPanelProps {
  tenantId: string;
  groups: AudienceGroupItem[];
  onUpdate: () => void;
}

export function AudienceGroupsPanel({
  tenantId,
  groups,
  onUpdate,
}: AudienceGroupsPanelProps) {
  const [isCreating, setIsCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [groupType, setGroupType] = React.useState<
    "DEPARTMENT" | "SITE_LOCATION" | "JOB_ROLE" | "CUSTOM"
  >("DEPARTMENT");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setErrorBanner(null);

    try {
      const res = await manageAudienceGroupAction({
        operation: "CREATE_GROUP",
        tenantId,
        name: name.trim(),
        groupType,
      });

      if (!res.success) {
        setErrorBanner(res.error.message);
        return;
      }

      setName("");
      setIsCreating(false);
      onUpdate();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to delete audience group "${groupName}"?`)) {
      return;
    }

    try {
      const res = await manageAudienceGroupAction({
        operation: "DELETE_GROUP",
        tenantId,
        groupId,
      });

      if (!res.success) {
        alert(res.error.message);
        return;
      }

      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete group");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Audience Dispatch Groups</h3>
          <p className="text-xs text-muted-foreground">
            Target groups for targeted SOP read acknowledgments and frontline training queues.
          </p>
        </div>
        {!isCreating && (
          <Button size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            <span>Create Group</span>
          </Button>
        )}
      </div>

      {errorBanner && (
        <div className="flex items-start space-x-2 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Create Group Form */}
      {isCreating && (
        <Card className="border-border shadow-xs bg-muted/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">New Audience Group</CardTitle>
            <CardDescription className="text-xs">
              Define a logical grouping for targeted SOP assignment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Group Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cleanroom Shift A"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Group Type
                  </label>
                  <select
                    value={groupType}
                    onChange={(e) =>
                      setGroupType(
                        e.target.value as "DEPARTMENT" | "SITE_LOCATION" | "JOB_ROLE" | "CUSTOM"
                      )
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="DEPARTMENT">Department</option>
                    <option value="SITE_LOCATION">Site Location</option>
                    <option value="JOB_ROLE">Job Role</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreating(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Group"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Groups Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {groups.length === 0 ? (
          <div className="col-span-full rounded-lg border border-border/60 bg-card p-8 text-center text-muted-foreground text-sm">
            No audience groups configured yet. Click &quot;Create Group&quot; to define your first department or site.
          </div>
        ) : (
          groups.map((g) => (
            <Card key={g.id} className="border-border shadow-xs hover:border-border/80 transition-colors">
              <CardContent className="p-4 flex flex-col justify-between h-full space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {g.groupType.replace("_", " ")}
                    </span>
                    <h4 className="font-semibold text-sm text-foreground leading-tight">
                      {g.name}
                    </h4>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(g.id, g.name)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="flex items-center space-x-1.5 text-xs text-muted-foreground pt-2 border-t border-border/40">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    <strong>{g.memberCount}</strong> assigned member{g.memberCount === 1 ? "" : "s"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
