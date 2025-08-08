'use client';

import { useEffect } from 'react';
import clarity from '@microsoft/clarity';

interface ClarityProviderProps {
  projectId: string;
}

// Define Clarity interface
interface ClarityAPI {
  event: (eventName: string) => void;
  setTag: (key: string, value: string) => void;
  init: (projectId: string) => void;
}

// Extend Window interface to include Clarity
declare global {
  interface Window {
    clarity?: ClarityAPI;
  }
}

// Track if Clarity is initialized
let clarityInitialized = false;
const clarityQueue: (() => void)[] = [];

export default function ClarityProvider({ projectId }: ClarityProviderProps) {

  useEffect(() => {
    // Initialize Clarity only on client side
    if (typeof window !== 'undefined' && projectId && !clarityInitialized) {
      try {
        clarity.init(projectId);
        clarityInitialized = true;
        
        // Process any queued events
        while (clarityQueue.length > 0) {
          const queuedEvent = clarityQueue.shift();
          if (queuedEvent) {
            queuedEvent();
          }
        }
      } catch (error) {
        console.warn('Microsoft Clarity initialization failed:', error);
      }
    }
  }, [projectId]);

  // This component doesn't render anything
  return null;
}

// Helper function to safely execute Clarity commands
const safeClarityCall = (callback: () => void) => {
  if (typeof window === 'undefined') return;
  
  if (clarityInitialized && typeof window.clarity !== 'undefined') {
    try {
      callback();
    } catch (error) {
      console.warn('Clarity API call failed:', error);
    }
  } else {
    // Queue the event for when Clarity is ready
    clarityQueue.push(callback);
  }
};

// Utility functions for custom event tracking
export const trackToolSelection = (toolId: string, toolName: string) => {
  safeClarityCall(() => {
    clarity.event('tool_selected');
    clarity.setTag('current_tool', toolId);
    clarity.setTag('current_tool_name', toolName);
  });
};

export const trackNetworkToggle = (network: string, previousNetwork?: string) => {
  safeClarityCall(() => {
    clarity.event('network_toggle');
    clarity.setTag('network', network);
    clarity.setTag('previous_network', previousNetwork || 'unknown');
  });
};

export const trackToolAction = (action: string, toolId: string) => {
  safeClarityCall(() => {
    clarity.event('tool_action');
    clarity.setTag('action', action);
    clarity.setTag('tool_id', toolId);
  });
};

export const trackUserJourney = (step: string) => {
  safeClarityCall(() => {
    clarity.event('user_journey');
    clarity.setTag('journey_step', step);
    clarity.setTag('timestamp', new Date().toISOString());
  });
};

export const trackError = (error: string, context: string, toolId?: string) => {
  safeClarityCall(() => {
    clarity.event('error_encountered');
    clarity.setTag('error', error);
    clarity.setTag('context', context);
    clarity.setTag('tool_id', toolId || 'unknown');
  });
};