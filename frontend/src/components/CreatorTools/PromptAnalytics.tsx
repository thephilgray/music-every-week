import React from 'react';
import { BarChart3, Users, MessageSquare, Award, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Prompt, Submission } from '../../types';

interface ParticipantRow {
    id: string;
    name: string;
    contact: string;
    status: string;
    type: 'user' | 'email';
    extensionHours?: number;
    hasPass?: boolean;
}

interface PromptAnalyticsProps {
    request: Prompt;
    participants: ParticipantRow[];
    submissions: Submission[];
    comments: unknown[];
}

export const PromptAnalytics: React.FC<PromptAnalyticsProps> = ({
    request,
    participants,
    submissions,
    comments,
}) => {
    // Calculate stats
    const submittedCount = Math.max(participants.filter(p => p.status === 'submitted').length, submissions.length);
    const passCount = participants.filter(p => p.hasPass === true).length;
    const totalParticipants = Math.max(participants.length, submittedCount + passCount, 1);
    const pendingCount = participants.filter(p => p.status === 'pending' || p.status === 'invited').length;
    const acceptedNoSubmitCount = participants.filter(p => p.status === 'accepted' && !p.hasPass).length;
    
    const submissionRate = Math.min(Math.round((submittedCount / totalParticipants) * 100), 100);
    const passRate = Math.min(Math.round((passCount / totalParticipants) * 100), 100);
    const inactiveRate = Math.min(Math.round(((acceptedNoSubmitCount + pendingCount) / totalParticipants) * 100), 100);

    // Collaboration count (tracks with collaborators)
    const collabSubmissions = submissions.filter(s => s.collaborators && Object.keys(s.collaborators).length > 0).length;

    // Feedback participation calculations
    const commentersSet = new Set(
        comments.map((c: any) => c.authorUid || c.userId || c.authorEmail?.toLowerCase() || c.userEmail?.toLowerCase()).filter(Boolean)
    );
    const feedbackGiversCount = participants.filter(p => {
        const idMatch = p.id && commentersSet.has(p.id);
        const emailMatch = p.contact && commentersSet.has(p.contact.toLowerCase());
        return idMatch || emailMatch;
    }).length;
    const effectiveFeedbackGivers = Math.max(feedbackGiversCount, Math.min(commentersSet.size, totalParticipants));
    const feedbackRate = Math.min(Math.round((effectiveFeedbackGivers / totalParticipants) * 100), 100);

    // Status breakdown for Bar chart
    const statusData = [
        { label: 'Submitted', count: submittedCount, color: 'bg-green-500', textClass: 'text-green-400', border: 'border-green-500/30' },
        { label: 'Used Pass', count: passCount, color: 'bg-purple-500', textClass: 'text-purple-400', border: 'border-purple-500/30' },
        { label: 'In Progress / Accepted', count: acceptedNoSubmitCount, color: 'bg-blue-500', textClass: 'text-blue-400', border: 'border-blue-500/30' },
        { label: 'Pending Invite', count: pendingCount, color: 'bg-amber-500', textClass: 'text-amber-400', border: 'border-amber-500/30' },
    ];

    const maxCount = Math.max(...statusData.map(d => d.count), 1);

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-xl group-hover:bg-green-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Submission Rate</span>
                        <div className="p-2 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{submissionRate}%</span>
                        <span className="text-xs text-gray-400">({submittedCount}/{participants.length})</span>
                    </div>
                    <div className="w-full bg-gray-900 h-1.5 rounded-full mt-4 overflow-hidden">
                        <div className="bg-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${submissionRate}%` }} />
                    </div>
                </div>

                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Passes Used</span>
                        <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                            <Award className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{passCount}</span>
                        <span className="text-xs text-purple-400 font-medium">({passRate}%)</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Members opting for pass relief</p>
                </div>

                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Collaborations</span>
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{collabSubmissions}</span>
                        <span className="text-xs text-gray-400">tracks</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Multi-member co-productions</p>
                </div>

                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Feedback Rate</span>
                        <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                            <MessageSquare className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{feedbackRate}%</span>
                        <span className="text-xs text-gray-400">({effectiveFeedbackGivers}/{totalParticipants})</span>
                    </div>
                    <div className="w-full bg-gray-900 h-1.5 rounded-full mt-4 overflow-hidden">
                        <div className="bg-amber-500 h-full rounded-full transition-all duration-1000" style={{ width: `${feedbackRate}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">{comments.length} comments across {submissions.length} tracks</p>
                </div>
            </div>

            {/* Main Visual Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Status Bar Chart */}
                <div className="lg:col-span-2 bg-gray-950 border border-gray-800/80 rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-blue-400" /> Participant Status Distribution
                                </h3>
                                <p className="text-xs text-gray-400 mt-0.5">Breakdown of member activity for "{request.title}"</p>
                            </div>
                        </div>

                        <div className="space-y-4 my-6">
                            {statusData.map((item, idx) => {
                                const percentage = Math.round((item.count / totalParticipants) * 100) || 0;
                                const barWidth = Math.max(Math.round((item.count / maxCount) * 100), item.count > 0 ? 8 : 0);
                                return (
                                    <div key={idx} className="space-y-1.5">
                                        <div className="flex justify-between text-xs font-medium">
                                            <span className="text-gray-300 flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${item.color}`} />
                                                {item.label}
                                            </span>
                                            <span className="text-gray-400 font-mono">
                                                <strong className="text-white">{item.count}</strong> ({percentage}%)
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-900 h-6 rounded-xl p-1 overflow-hidden flex items-center">
                                            <div
                                                className={`${item.color} h-full rounded-lg transition-all duration-1000 flex items-center justify-end px-2`}
                                                style={{ width: `${barWidth}%` }}
                                            >
                                                {barWidth > 15 && (
                                                    <span className="text-[10px] font-black text-black/80">{item.count}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Horizontal Stacked Summary Bar */}
                    <div className="border-t border-gray-800 pt-5 mt-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-2 font-medium">
                            <span>Overall Engagement Proportion</span>
                            <span>{submittedCount + passCount} Active / {totalParticipants} Total</span>
                        </div>
                        <div className="w-full bg-gray-900 h-4 rounded-full overflow-hidden flex">
                            <div 
                                className="bg-green-500 h-full transition-all duration-1000" 
                                style={{ width: `${(submittedCount / totalParticipants) * 100}%` }} 
                                title={`Submitted: ${submittedCount}`}
                            />
                            <div 
                                className="bg-purple-500 h-full transition-all duration-1000" 
                                style={{ width: `${(passCount / totalParticipants) * 100}%` }} 
                                title={`Pass: ${passCount}`}
                            />
                            <div 
                                className="bg-blue-500 h-full transition-all duration-1000" 
                                style={{ width: `${(acceptedNoSubmitCount / totalParticipants) * 100}%` }} 
                                title={`In Progress: ${acceptedNoSubmitCount}`}
                            />
                            <div 
                                className="bg-amber-500 h-full transition-all duration-1000" 
                                style={{ width: `${(pendingCount / totalParticipants) * 100}%` }} 
                                title={`Pending: ${pendingCount}`}
                            />
                        </div>
                    </div>

                    {/* Peer Review & Feedback Participation Chart */}
                    <div className="border-t border-gray-800 pt-5 mt-4">
                        <div className="flex justify-between text-xs text-gray-400 mb-2 font-medium">
                            <span className="flex items-center gap-1.5 text-gray-300">
                                <span className="w-2 h-2 rounded-full bg-amber-500" /> Peer Review Participation (Members leaving feedback)
                            </span>
                            <span className="font-mono"><strong className="text-white">{effectiveFeedbackGivers}</strong> / {totalParticipants} ({feedbackRate}%)</span>
                        </div>
                        <div className="w-full bg-gray-900 h-6 rounded-xl p-1 overflow-hidden flex items-center">
                            <div
                                className="bg-amber-500 h-full rounded-lg transition-all duration-1000 flex items-center justify-end px-2"
                                style={{ width: `${Math.max(feedbackRate, effectiveFeedbackGivers > 0 ? 8 : 0)}%` }}
                            >
                                {feedbackRate > 15 && (
                                    <span className="text-[10px] font-black text-black/80">{effectiveFeedbackGivers}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Audit Insights Panel */}
                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                            <ShieldAlert className="w-5 h-5 text-red-400" /> Host Audit Action List
                        </h3>
                        <p className="text-xs text-gray-400 mb-6">
                            Members requiring attention or list hygiene
                        </p>

                        <div className="space-y-4">
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-red-400 uppercase tracking-wide">Inactive (At Risk)</span>
                                    <span className="text-lg font-black text-white">{acceptedNoSubmitCount + pendingCount} <span className="text-xs font-normal text-red-400">({inactiveRate}%)</span></span>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    Did not submit a track and did not use a pass. Eligible for weekly distro removal.
                                </p>
                            </div>

                            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wide">Pass Users</span>
                                    <span className="text-lg font-black text-white">{passCount}</span>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    Excused for this week. Retain on Mailchimp active distribution list.
                                </p>
                            </div>

                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-green-400 uppercase tracking-wide">Active Submitters</span>
                                    <span className="text-lg font-black text-white">{submittedCount}</span>
                                </div>
                                <p className="text-[11px] text-gray-400">
                                    In good standing. Delivered original audio for this assignment.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-800">
                        <p className="text-[11px] text-gray-500 italic">
                            Switch back to Management view to trigger the Distro & Tag Helper for Mailchimp exports.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
