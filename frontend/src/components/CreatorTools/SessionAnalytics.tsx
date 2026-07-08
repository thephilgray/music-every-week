import React, { useState, useEffect } from 'react';
import { TrendingUp, Music, Award, ArrowUpRight, ArrowDownRight, Layers, MessageSquare } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Session, Prompt } from '../../types';
import { getTimestampAsNumber } from '../../lib/utils';

interface SessionAnalyticsProps {
    session: Session;
    sessionPrompts: Prompt[];
}

export const SessionAnalytics: React.FC<SessionAnalyticsProps> = ({
    session,
    sessionPrompts,
}) => {
    const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
    const [commentAuthors, setCommentAuthors] = useState<Record<string, Set<string>>>({});

    useEffect(() => {
        const fetchAnalyticsData = async () => {
            const promptIds = sessionPrompts.map(p => p.id).filter(Boolean) as string[];
            if (promptIds.length === 0) {
                setSubmissionCounts({});
                setCommentAuthors({});
                return;
            }
            try {
                const counts: Record<string, number> = {};
                const commAuthors: Record<string, Set<string>> = {};
                for (let i = 0; i < promptIds.length; i += 30) {
                    const chunk = promptIds.slice(i, i + 30);
                    const qSub = query(
                        collection(db, 'submissions'),
                        where('requestId', 'in', chunk)
                    );
                    const snapSub = await getDocs(qSub);
                    snapSub.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data.deleted) return;
                        const reqId = data.requestId;
                        if (reqId) {
                            counts[reqId] = (counts[reqId] || 0) + 1;
                        }
                    });

                    const qComm = query(
                        collection(db, 'comments'),
                        where('requestId', 'in', chunk)
                    );
                    const snapComm = await getDocs(qComm);
                    snapComm.forEach(docSnap => {
                        const data = docSnap.data();
                        const reqId = data.requestId;
                        if (reqId) {
                            if (!commAuthors[reqId]) commAuthors[reqId] = new Set();
                            const author = data.authorUid || data.userId || data.authorEmail?.toLowerCase() || data.userEmail?.toLowerCase();
                            if (author) commAuthors[reqId].add(author);
                        }
                    });
                }
                setSubmissionCounts(counts);
                setCommentAuthors(commAuthors);
            } catch (err) {
                console.error("Error fetching session analytics:", err);
            }
        };

        fetchAnalyticsData();
    }, [sessionPrompts]);

    // Sort prompts chronologically
    const sortedPrompts = [...sessionPrompts].sort((a, b) => 
        getTimestampAsNumber(a.createdAt) - getTimestampAsNumber(b.createdAt)
    );

    const totalPrompts = sortedPrompts.length;

    const chartData = sortedPrompts.map((p, idx) => {
        const pMap = p.participants || {};
        const pList = Object.values(pMap) as Array<{ id?: string; contact?: string; status?: string; hasPass?: boolean }>;
        const submitted = (p.id && submissionCounts[p.id]) || 0;
        const passes = pList.filter(x => x.hasPass === true).length;
        const totalP = Math.max(pList.length, submitted + passes, 1);

        const authorsSet = (p.id && commentAuthors[p.id]) || new Set<string>();
        const feedbackGivers = pList.filter(x => {
            const idMatch = x.id && authorsSet.has(x.id);
            const emailMatch = x.contact && authorsSet.has(x.contact.toLowerCase());
            return idMatch || emailMatch;
        }).length;
        const effectiveFeedbackGivers = Math.max(feedbackGivers, Math.min(authorsSet.size, totalP));
        const feedbackRate = Math.min(Math.round((effectiveFeedbackGivers / totalP) * 100), 100);

        return {
            name: `W${idx + 1}`,
            title: p.title || `Prompt ${idx + 1}`,
            submitted,
            passes,
            total: totalP,
            rate: Math.min(Math.round(((submitted + passes) / totalP) * 100), 100),
            feedbackGivers: effectiveFeedbackGivers,
            feedbackRate,
        };
    });

    const totalTracks = chartData.reduce((sum, item) => sum + item.submitted, 0);
    const totalPasses = chartData.reduce((sum, item) => sum + item.passes, 0);

    const avgTracks = totalPrompts > 0 ? (totalTracks / totalPrompts).toFixed(1) : '0';
    const avgPasses = totalPrompts > 0 ? (totalPasses / totalPrompts).toFixed(1) : '0';
    
    // Calculate retention (compare last week submitted to first week submitted)
    const firstWeek = chartData[0]?.submitted || 0;
    const lastWeek = chartData[chartData.length - 1]?.submitted || 0;
    const retentionDiff = firstWeek > 0 ? Math.round(((lastWeek - firstWeek) / firstWeek) * 100) : 0;

    const maxChartValue = Math.max(...chartData.map(d => d.submitted + d.passes), 10);

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Prompts</span>
                        <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                            <Layers className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{totalPrompts}</span>
                        <span className="text-xs text-gray-400">assignments</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">In session "{session.name}"</p>
                </div>

                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-xl group-hover:bg-green-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Volume</span>
                        <div className="p-2 bg-green-500/10 text-green-400 rounded-xl border border-green-500/20">
                            <Music className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{totalTracks}</span>
                        <span className="text-xs text-green-400 font-medium">tracks</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Avg {avgTracks} tracks per week</p>
                </div>

                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pass Relief Avg</span>
                        <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20">
                            <Award className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{avgPasses}</span>
                        <span className="text-xs text-purple-400">per prompt</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">{totalPasses} total passes claimed</p>
                </div>

                <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-5 relative overflow-hidden group hover:border-gray-700 transition">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition" />
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Volume Trend</span>
                        <div className={`p-2 rounded-xl border flex items-center gap-1 text-xs font-bold ${
                            retentionDiff >= 0 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                            {retentionDiff >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {Math.abs(retentionDiff)}%
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-white">{lastWeek}</span>
                        <span className="text-xs text-gray-400">latest week</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-4">Compared to {firstWeek} in week 1</p>
                </div>
            </div>

            {/* Session Retention & Volume Bar Chart */}
            <div className="bg-gray-950 border border-gray-800/80 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                    <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-green-400" /> Session Output & Retention Cadence
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Weekly track submissions (green) and pass relief claims (purple) over the session timeline
                        </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium flex-wrap">
                        <span className="flex items-center gap-2 text-gray-300">
                            <span className="w-3 h-3 bg-green-500 rounded-sm" /> Submitted Tracks
                        </span>
                        <span className="flex items-center gap-2 text-gray-300">
                            <span className="w-3 h-3 bg-purple-500 rounded-sm" /> Used Passes
                        </span>
                        <span className="flex items-center gap-2 text-gray-300">
                            <span className="w-3 h-3 bg-amber-500 rounded-sm" /> Feedback Givers
                        </span>
                    </div>
                </div>

                {chartData.length === 0 ? (
                    <div className="py-12 text-center text-gray-500 text-sm">
                        No prompts found in this session yet.
                    </div>
                ) : (
                    <div className="mt-8">
                        {/* Bars Container */}
                        <div className="flex items-end gap-3 sm:gap-6 h-64 pt-6 pb-2 border-b border-gray-800 px-2 overflow-x-auto">
                            {chartData.map((d, idx) => {
                                const subHeight = Math.max(Math.round((d.submitted / maxChartValue) * 100), d.submitted > 0 ? 8 : 0);
                                const passHeight = Math.max(Math.round((d.passes / maxChartValue) * 100), d.passes > 0 ? 8 : 0);
                                const feedbackHeight = Math.max(Math.round((d.feedbackGivers / maxChartValue) * 100), d.feedbackGivers > 0 ? 8 : 0);
                                return (
                                    <div key={idx} className="flex-1 min-w-[56px] flex flex-col items-center gap-2 h-full justify-end group">
                                        {/* Value tooltip/label on hover */}
                                        <div className="opacity-0 group-hover:opacity-100 transition duration-200 bg-gray-800 text-white text-[10px] py-1 px-2 rounded border border-gray-700 whitespace-nowrap mb-1 pointer-events-none shadow-xl z-10">
                                            <div className="font-bold text-blue-300">{d.title}</div>
                                            <div>Tracks: <strong className="text-green-400">{d.submitted}</strong></div>
                                            <div>Passes: <strong className="text-purple-400">{d.passes}</strong></div>
                                            <div>Feedback: <strong className="text-amber-400">{d.feedbackGivers} members ({d.feedbackRate}%)</strong></div>
                                        </div>

                                        {/* Side-by-Side Bars Container */}
                                        <div className="w-full max-w-[56px] h-full flex items-end justify-center gap-1">
                                            {/* Bar 1: Stacked Tracks + Passes */}
                                            <div className="flex-1 bg-gray-900/80 rounded-t-xl h-full flex flex-col justify-end p-0.5 gap-0.5 border border-gray-800/50 group-hover:border-gray-700 transition">
                                                {d.passes > 0 && (
                                                    <div 
                                                        className="w-full bg-purple-500/80 hover:bg-purple-500 rounded-md transition-all duration-700 flex items-center justify-center text-[9px] font-bold text-white"
                                                        style={{ height: `${passHeight}%` }}
                                                        title={`${d.passes} passes`}
                                                    >
                                                        {passHeight > 15 && d.passes}
                                                    </div>
                                                )}
                                                {d.submitted > 0 && (
                                                    <div 
                                                        className="w-full bg-green-500 hover:bg-green-400 rounded-md transition-all duration-700 flex items-center justify-center text-[10px] font-black text-gray-950 shadow-lg"
                                                        style={{ height: `${subHeight}%` }}
                                                        title={`${d.submitted} tracks`}
                                                    >
                                                        {subHeight > 12 && d.submitted}
                                                    </div>
                                                )}
                                                {d.submitted === 0 && d.passes === 0 && (
                                                    <div className="w-full h-1 bg-gray-800 rounded-full mt-auto" />
                                                )}
                                            </div>

                                            {/* Bar 2: Feedback Givers */}
                                            <div className="flex-1 bg-gray-900/80 rounded-t-xl h-full flex flex-col justify-end p-0.5 border border-gray-800/50 group-hover:border-gray-700 transition">
                                                {d.feedbackGivers > 0 ? (
                                                    <div 
                                                        className="w-full bg-amber-500 hover:bg-amber-400 rounded-md transition-all duration-700 flex items-center justify-center text-[10px] font-black text-gray-950 shadow-lg"
                                                        style={{ height: `${feedbackHeight}%` }}
                                                        title={`${d.feedbackGivers} members leaving feedback`}
                                                    >
                                                        {feedbackHeight > 12 && d.feedbackGivers}
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-1 bg-gray-800 rounded-full mt-auto" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* X-Axis Labels */}
                        <div className="flex items-start gap-3 sm:gap-6 pt-3 px-2 overflow-x-auto">
                            {chartData.map((d, idx) => (
                                <div key={idx} className="flex-1 min-w-[56px] text-center">
                                    <div className="text-xs font-bold text-gray-300">{d.name}</div>
                                    <div className="text-[10px] text-gray-500 truncate max-w-[60px] mx-auto mt-0.5" title={d.title}>
                                        {d.title}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Detailed Prompts Breakdown Table */}
            <div className="bg-gray-950 border border-gray-800/80 rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-gray-800 bg-gray-900/30 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Session Prompts Roster
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">
                        {sortedPrompts.length} total
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-gray-800 text-xs font-semibold uppercase text-gray-400 bg-gray-900/50">
                                <th className="py-3 px-4">#</th>
                                <th className="py-3 px-4">Prompt Title</th>
                                <th className="py-3 px-4">Deadline</th>
                                <th className="py-3 px-4">Submitted</th>
                                <th className="py-3 px-4">Passes</th>
                                <th className="py-3 px-4">Activity Rate</th>
                                <th className="py-3 px-4">Feedback Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50 text-xs">
                            {chartData.map((row, idx) => {
                                const promptObj = sortedPrompts[idx];
                                const deadlineStr = promptObj?.deadline ? new Date(promptObj.deadline).toLocaleDateString() : 'N/A';
                                return (
                                    <tr key={idx} className="hover:bg-gray-900/30 transition">
                                        <td className="py-3.5 px-4 font-mono text-gray-400 font-bold">{row.name}</td>
                                        <td className="py-3.5 px-4 font-bold text-white">{row.title}</td>
                                        <td className="py-3.5 px-4 text-gray-400">{deadlineStr}</td>
                                        <td className="py-3.5 px-4 font-bold text-green-400">{row.submitted} tracks</td>
                                        <td className="py-3.5 px-4 text-purple-400 font-medium">{row.passes} passes</td>
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-16 bg-gray-900 h-1.5 rounded-full overflow-hidden">
                                                    <div className="bg-blue-500 h-full" style={{ width: `${row.rate}%` }} />
                                                </div>
                                                <span className="font-mono text-gray-300">{row.rate}%</span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 font-medium text-amber-400">
                                            <div className="flex items-center gap-1.5">
                                                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                                <span>{row.feedbackRate}% ({row.feedbackGivers})</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
