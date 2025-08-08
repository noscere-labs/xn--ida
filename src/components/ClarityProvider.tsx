'use client';

import { useEffect } from 'react';
import clarity from '@microsoft/clarity';

interface ClarityProviderProps {
  projectId: string;
}

export default function ClarityProvider({ projectId }: ClarityProviderProps) {
  useEffect(() => {
    // Initialize Clarity only on client side
    if (typeof window !== 'undefined' && projectId) {
      clarity.init(projectId);
    }
  }, [projectId]);

  // This component doesn't render anything
  return null;
}

// Utility functions for custom event tracking
export const trackToolSelection = (toolId: string, toolName: string) => {
  if (typeof window !== 'undefined') {
    clarity.event('tool_selected');
    clarity.setTag('current_tool', toolId);
    clarity.setTag('current_tool_name', toolName);
  }
};

export const trackNetworkToggle = (network: string, previousNetwork?: string) => {
  if (typeof window !== 'undefined') {
    clarity.event('network_toggle');
    clarity.setTag('network', network);
    clarity.setTag('previous_network', previousNetwork || 'unknown');
  }
};

export const trackToolAction = (action: string, toolId: string) => {
  if (typeof window !== 'undefined') {
    clarity.event('tool_action');
    clarity.setTag('action', action);
    clarity.setTag('tool_id', toolId);
  }
};

export const trackUserJourney = (step: string) => {
  if (typeof window !== 'undefined') {
    clarity.event('user_journey');
    clarity.setTag('journey_step', step);
    clarity.setTag('timestamp', new Date().toISOString());
  }
};

export const trackError = (error: string, context: string, toolId?: string) => {
  if (typeof window !== 'undefined') {
    clarity.event('error_encountered');
    clarity.setTag('error', error);
    clarity.setTag('context', context);
    clarity.setTag('tool_id', toolId || 'unknown');
  }
};