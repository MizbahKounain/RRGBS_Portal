import React, { useState } from 'react';
import { Check, Copy, Linkedin, Share2, X } from 'lucide-react';
import { Job } from '../types';
import { getJobShareUrl, getLinkedInShareUrl, getXShareUrl } from '../utils/jobSharing';

interface ShareJobModalProps {
  job: Job | null;
  onClose: () => void;
}

export const ShareJobModal: React.FC<ShareJobModalProps> = ({ job, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!job) return null;

  const shareUrl = getJobShareUrl(job);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const openShareWindow = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer,width=760,height=680');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-red-50 text-[#d71920] flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-base text-gray-900">Share this job</h2>
              <p className="text-xs text-gray-500 truncate">{job.title} • {job.company}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close share dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-[11px] text-gray-500 font-semibold mb-1">Job link</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 outline-none"
              />
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#d71920] text-white text-xs font-bold hover:bg-[#b8141a] transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => openShareWindow(getLinkedInShareUrl(job))}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-[#0A66C2] hover:bg-blue-50 hover:border-blue-200 transition-colors"
            >
              <Linkedin className="w-4 h-4" />
              LinkedIn
            </button>
            <button
              type="button"
              onClick={() => openShareWindow(getXShareUrl(job))}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <span className="text-base leading-none font-black">𝕏</span>
              X
            </button>
          </div>

          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              type="button"
              onClick={() => navigator.share({ title: `${job.title} at ${job.company}`, text: `Check out this job: ${job.title} at ${job.company}`, url: shareUrl }).catch(() => {})}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 text-white px-4 py-3 text-sm font-bold hover:bg-black transition-colors"
            >
              <Share2 className="w-4 h-4" />
              More sharing options
            </button>
          )}

          <p className="text-[11px] leading-relaxed text-gray-500 text-center">
            Anyone opening this link will be taken directly to this job and can apply for the position.
          </p>
        </div>
      </div>
    </div>
  );
};
