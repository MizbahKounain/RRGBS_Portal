import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Download, FileSpreadsheet, Users, X, Search, IndianRupee, CheckCircle2, Crown, Sparkles } from 'lucide-react';
import { api, downloadRecruiterApplicants, downloadRecruiterResume } from '../api';

type RecruiterApplication = { id: string; applicantName: string; email: string; phone: string; experience?: string; currentLocation?: string; resumeFileName: string; hasResume: boolean; appliedAt: string };
type RecruiterJob = { id: string; title: string; company: string; location: string; category: string; skills?: string[]; postedDate: string; applicationCount: number; applications: RecruiterApplication[] };

const plans = [
  { name: 'BASIC', price: '970', validity: '10 DAYS', features: ['3 Job Posting - Display / 10 days', 'Unlimited Database Search', '30 Resume Download', '70 Mass Mail', '30 Excel Download', '10 Feature Job', '10 days Feature Employer', '1 Subuser'] },
  { name: 'STANDARD', price: '1613', validity: '20 DAYS', features: ['6 Job Posting - Display / 20 days', 'Unlimited Database Search', '50 Resume Download', '100 Mass Mail', '50 Excel Download', '10 Feature Job', '20 days Feature Employer', '1 Subuser'] },
  { name: 'PLATINUM', price: '2350', validity: '30 DAYS', features: ['10 Job Posting - Display / 30 days', 'Unlimited Database Search', '100 Resume Download', '300 Mass Mail', '100 Excel Download', '10 Feature Job', '30 days Feature Employer', '1 Subuser'] },
];

function filterMatch(job: RecruiterJob, filter: string) {
  if (filter === 'all') return true;
  const hay = [job.category, job.title, ...(job.skills || [])].join(' ').toLowerCase();
  if (filter === 'software') return /software|developer|development|programmer|react|node|full.?stack|frontend|backend|engineering|engineer|tech/.test(hay);
  if (filter === 'it') return /\bit\b|information technology|software|developer|development|tech/.test(hay);
  if (filter === 'non-it') return !/\bit\b|information technology|software|developer|development|tech/.test(hay);
  return true;
}

export const RecruiterPortalModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [jobs, setJobs] = useState<RecruiterJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [activeTab, setActiveTab] = useState<'jobs' | 'pricing'>('jobs');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true); setError(''); setActiveTab('jobs');
    api.recruiterJobs().then((r) => setJobs(r.jobs)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load your jobs.')).finally(() => setLoading(false));
  }, [isOpen]);

  const visibleJobs = useMemo(() => jobs.filter((job) => filterMatch(job, filter) && (!search.trim() || [job.title, job.company, job.location, job.category].join(' ').toLowerCase().includes(search.toLowerCase().trim()))), [jobs, filter, search]);

  if (!isOpen) return null;

  const downloadResume = async (job: RecruiterJob, application: RecruiterApplication) => {
    try { setDownloading(application.id); await downloadRecruiterResume(job.id, application.id, application.resumeFileName || `${application.applicantName}-resume`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not download the resume.'); }
    finally { setDownloading(''); }
  };

  const downloadExcel = async (job: RecruiterJob) => {
    try { setDownloading(`excel:${job.id}`); await downloadRecruiterApplicants(job.id, `${job.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 50) || 'job'}-applicants.xlsx`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not download the Excel sheet.'); }
    finally { setDownloading(''); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[92vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b px-5 sm:px-7 py-4 flex items-center justify-between">
          <div><h2 className="text-xl font-extrabold">Recruiter Portal</h2><p className="text-xs text-gray-500">Manage only the jobs and applicants belonging to your recruiter account.</p></div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X /></button>
        </div>
        <div className="px-5 sm:px-7 pt-5">
          <div className="flex flex-wrap gap-2 border-b border-gray-200">
            <button onClick={() => setActiveTab('jobs')} className={`px-4 py-2.5 text-sm font-extrabold border-b-2 transition ${activeTab === 'jobs' ? 'text-[#d71920] border-[#d71920]' : 'text-gray-500 border-transparent'}`}><BriefcaseBusiness className="inline w-4 h-4 mr-1.5" />My Jobs & Applicants</button>
            <button onClick={() => setActiveTab('pricing')} className={`px-4 py-2.5 text-sm font-extrabold border-b-2 transition ${activeTab === 'pricing' ? 'text-[#d71920] border-[#d71920]' : 'text-gray-500 border-transparent'}`}><IndianRupee className="inline w-4 h-4 mr-1.5" />Pricing</button>
          </div>
        </div>

        {activeTab === 'jobs' ? (
          <div className="p-5 sm:p-7">
            <div className="flex flex-col lg:flex-row gap-3 mb-5">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your jobs..." className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#d71920]" /></div>
              <div className="flex flex-wrap gap-2">
                {[['all','All'],['it','IT'],['software','Software'],['non-it','Non IT']].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${filter === value ? 'bg-[#d71920] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{label}</button>)}
              </div>
            </div>
            {loading && <div className="py-12 text-center text-gray-500">Loading your jobs…</div>}
            {!loading && error && <div className="mb-5 p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            {!loading && !error && jobs.length === 0 && <div className="py-16 text-center"><BriefcaseBusiness className="w-12 h-12 mx-auto text-gray-300" /><h3 className="mt-4 text-lg font-extrabold">No jobs posted by you</h3><p className="text-sm text-gray-500 mt-1">Post your first job to see it here.</p></div>}
            {!loading && !error && jobs.length > 0 && visibleJobs.length === 0 && <div className="py-12 text-center text-gray-500">No jobs match this recruiter filter.</div>}
            <div className="space-y-5">
              {visibleJobs.map((job) => <div key={job.id} className="border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg transition-shadow duration-300">
                <div className="p-5 bg-gradient-to-r from-gray-50 to-white flex flex-wrap items-center justify-between gap-3">
                  <div><h3 className="font-extrabold text-lg">{job.title}</h3><p className="text-sm text-gray-500">{job.company} · {job.location} · {job.category}</p></div>
                  <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-700 bg-white border rounded-lg px-3 py-2"><Users className="w-4 h-4 text-[#d71920]" />{job.applicationCount} applied</span><button onClick={() => downloadExcel(job)} disabled={downloading === `excel:${job.id}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111] text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" />{downloading === `excel:${job.id}` ? 'Preparing…' : 'Download Excel'}</button></div>
                </div>
                <div className="p-5">
                  {job.applications.length === 0 ? <p className="text-sm text-gray-500">No applications received yet.</p> : <div className="space-y-2">{job.applications.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3 hover:bg-gray-50 transition"><div><p className="font-bold text-sm">{a.applicantName}</p><p className="text-xs text-gray-500">{a.email} · {a.phone}{a.experience ? ` · ${a.experience}` : ''}</p></div>{a.hasResume ? <button disabled={downloading === a.id} onClick={() => downloadResume(job, a)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#d71920] text-white text-xs font-bold hover:bg-[#b8141a] disabled:opacity-50">{downloading === a.id ? 'Downloading…' : <><Download className="w-4 h-4" />Download Resume</>}</button> : <span className="text-xs text-gray-400">No resume</span>}</div>)}</div>}
                </div>
              </div>)}
            </div>
          </div>
        ) : (
          <div className="p-5 sm:p-7 bg-[#f7f9fc]">
            <div className="max-w-3xl mx-auto text-center mb-8"><span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-[#d71920] text-xs font-extrabold"><Sparkles className="w-3.5 h-3.5" />Recruiter Packages</span><h3 className="mt-3 text-3xl font-black text-[#172554]">Hire Staff in India, at the Best Price.</h3><p className="mt-3 text-xs sm:text-sm text-gray-600 leading-relaxed">Terms &amp; Conditions<br />All Prices are Exclusive of GST.<br />All Combo Packages are designed considering the optimum needs of an Employer; specific products / add-ons can be purchased separately.<br />Individual product validity and terms apply apart from the validity and pricing combined in these packages.<br />Management reserves the right to change conditions from time to time.</p></div>
            <div className="grid md:grid-cols-3 gap-5">
              {plans.map((plan, index) => <div key={plan.name} className={`bg-white rounded-2xl border ${index === 1 ? 'border-[#d71920] shadow-xl md:-translate-y-2' : 'border-gray-200'} p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-xl`}>
                {index === 1 && <div className="absolute top-0 left-0 right-0 h-1 bg-[#d71920]" />}
                <div className="flex items-center justify-between"><span className="text-sm font-bold tracking-wide text-[#6655d8]">{plan.name}</span>{index === 1 && <Crown className="w-5 h-5 text-[#d71920]" />}</div>
                <div className="mt-3 border-b-2 border-[#7257ff] pb-2"><span className="text-4xl font-black text-[#5b5bd6]">Rs {plan.price}</span></div>
                <div className="text-[10px] font-bold text-[#5b5bd6] mt-1">PACK VALIDITY / {plan.validity}</div>
                <ul className="mt-7 space-y-2.5 text-xs text-gray-800">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-[#d71920] shrink-0" /><span>{feature}</span></li>)}</ul>
                <button onClick={() => window.open(`https://wa.me/916363565865?text=${encodeURIComponent(`Hello RRGBS, I am interested in the ${plan.name} recruiter package priced at Rs ${plan.price}. Please share the next steps.`)}`, '_blank', 'noopener,noreferrer')} className="mt-7 w-full py-2.5 rounded-lg bg-[#d71920] text-white text-xs font-bold hover:bg-[#b8141a] transition">Enquire About {plan.name}</button>
              </div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
