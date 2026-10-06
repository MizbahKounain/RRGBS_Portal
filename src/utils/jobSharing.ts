import { Job } from '../types';

export function getJobShareUrl(job: Job): string {
  if (typeof window === 'undefined') return `/jobs/${encodeURIComponent(job.id)}`;
  return `${window.location.origin}/jobs/${encodeURIComponent(job.id)}`;
}

export function getLinkedInShareUrl(job: Job): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getJobShareUrl(job))}`;
}

export function getXShareUrl(job: Job): string {
  const text = `Check out this job: ${job.title} at ${job.company}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(getJobShareUrl(job))}`;
}
