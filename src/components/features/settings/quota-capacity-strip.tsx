"use client";

import * as React from "react";
import { Users, BookOpen, ShieldCheck, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface QuotaCapacityStripProps {
  creatorCount: number;
  creatorLimit: number;
  readerCount: number;
  readerLimit: number;
}

export function QuotaCapacityStrip({
  creatorCount,
  creatorLimit,
  readerCount,
  readerLimit,
}: QuotaCapacityStripProps) {
  const creatorPct = Math.min(100, Math.round((creatorCount / Math.max(1, creatorLimit)) * 100));
  const readerPct = Math.min(100, Math.round((readerCount / Math.max(1, readerLimit)) * 100));

  const creatorRemaining = Math.max(0, creatorLimit - creatorCount);
  const readerRemaining = Math.max(0, readerLimit - readerCount);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
      {/* Creator Seats Card */}
      <Card className="border-border shadow-xs hover:border-primary/40 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Creator Seats</CardTitle>
                <CardDescription className="text-xs">
                  Admins, Quality Managers, Authors & Approvers
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-semibold bg-primary/5 text-primary border-primary/20">
              High Privilege
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {creatorCount}
              </span>
              <span className="text-sm text-muted-foreground font-medium">
                / {creatorLimit} seats utilized
              </span>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {creatorPct}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                creatorPct >= 100 ? "bg-destructive" : creatorPct > 80 ? "bg-amber-500" : "bg-primary"
              }`}
              style={{ width: `${creatorPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span>Cryptographic signature eligible</span>
            </span>
            <span className="font-medium text-foreground">
              {creatorRemaining} available
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Reader Pack Card (DEC-01) */}
      <Card className="border-border shadow-xs hover:border-emerald-500/40 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-600">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Operational Reader Pack</CardTitle>
                <CardDescription className="text-xs">
                  Frontline staff & SOP read-acknowledgment users
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-semibold bg-emerald-50 text-emerald-700 border-emerald-200">
              Tier Pack (DEC-01)
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                {readerCount}
              </span>
              <span className="text-sm text-muted-foreground font-medium">
                / {readerLimit} readers utilized
              </span>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {readerPct}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                readerPct >= 100 ? "bg-destructive" : readerPct > 80 ? "bg-amber-500" : "bg-emerald-600"
              }`}
              style={{ width: `${readerPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <span className="flex items-center space-x-1">
              <Zap className="h-3.5 w-3.5 text-emerald-600" />
              <span>Zero per-seat markup on frontline staff</span>
            </span>
            <span className="font-medium text-foreground">
              {readerRemaining} available
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
