import React from 'react';
import { Job } from '../types';
import { ArrowRight, MapPin, Briefcase } from 'lucide-react';

interface Props { jobs: Job[]; onSelectJob: (job: Job) => void; }
const isNew = (job: Job) => {
  if (job.createdAt) { const t = new Date(job.createdAt).getTime(); return Number.isFinite(t) && Date.now() - t <= 7 * 86400000; }
  return /just now|today|1 day/i.test(job.postedDate || '');
};
export const LatestJobsSection: React.FC<Props> = ({ jobs, onSelectJob }) => {
  const latest = [...jobs].sort((a,b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  }).slice(0, 4);
  if (!latest.length) return null;
  return <section className="bg-slate-50 py-10 sm:py-14">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between gap-4 mb-6"><div><p className="text-xs font-bold tracking-[.2em] text-red-600 uppercase">Career opportunities</p><h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">Latest Jobs</h2><p className="text-sm text-slate-500 mt-1">Fresh opportunities recently posted by recruiters</p></div><span className="hidden sm:inline-flex rounded-full bg-red-50 text-red-700 px-3 py-1 text-xs font-bold">Recently added</span></div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{latest.map(job => <button key={job.id} onClick={() => onSelectJob(job)} className="text-left bg-white border border-slate-200 rounded-2xl p-5 hover:border-red-300 hover:shadow-lg transition-all">
        <div className="flex items-center justify-between gap-2 mb-3"><span className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center"><Briefcase size={19}/></span>{isNew(job) && <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-[10px] font-extrabold tracking-wide">NEW</span>}</div>
        <h3 className="font-bold text-slate-900 leading-snug">{job.title}</h3><p className="text-sm text-slate-600 mt-1">{job.company}</p><p className="text-xs text-slate-500 mt-3 flex items-center gap-1"><MapPin size={13}/>{job.location}</p><span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 mt-4">View job <ArrowRight size={14}/></span>
      </button>)}</div>
    </div>
  </section>;
};
