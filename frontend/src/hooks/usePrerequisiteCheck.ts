import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import type { Prompt } from '../types';

interface PrerequisiteCheckResult {
  /** Map of promptId → boolean indicating whether the current user meets the prerequisite */
  eligibility: Map<string, boolean>;
  /** Whether the prerequisite check is still loading */
  loading: boolean;
}

/**
 * Batch-checks prerequisite eligibility for all prompts in the feed.
 * 
 * For each prompt that has a `prerequisitePromptId`, checks whether the
 * current user has either:
 *   1. Submitted a track to the prerequisite prompt, OR
 *   2. Been granted `hasPass: true` on the prerequisite prompt's participants map
 * 
 * Prompts without a prerequisite are always marked as eligible.
 */
export function usePrerequisiteCheck(
  prompts: Prompt[],
  userUid: string | null | undefined,
  userEmail: string | null | undefined
): PrerequisiteCheckResult {
  const [eligibility, setEligibility] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);

  // Track the prerequisite IDs to avoid re-running on every render
  const prerequisiteIdsRef = useRef<string>('');

  useEffect(() => {
    // Collect all prompts that have prerequisites
    const promptsWithPrereqs = prompts.filter(p => p.prerequisitePromptId);
    const uniquePrereqIds = [...new Set(promptsWithPrereqs.map(p => p.prerequisitePromptId!))];

    // Build a stable key to avoid unnecessary re-fetches
    const prereqKey = uniquePrereqIds.sort().join(',');

    // If no prerequisites exist, mark everything as eligible immediately
    if (uniquePrereqIds.length === 0) {
      const map = new Map<string, boolean>();
      prompts.forEach(p => { if (p.id) map.set(p.id, true); });
      setEligibility(map);
      setLoading(false);
      prerequisiteIdsRef.current = prereqKey;
      return;
    }

    // If no user, mark prerequisite prompts as not eligible
    if (!userUid && !userEmail) {
      const map = new Map<string, boolean>();
      prompts.forEach(p => {
        if (p.id) map.set(p.id, !p.prerequisitePromptId);
      });
      setEligibility(map);
      setLoading(false);
      return;
    }

    // Skip if the prereq IDs haven't changed
    if (prereqKey === prerequisiteIdsRef.current && eligibility.size > 0) {
      return;
    }
    prerequisiteIdsRef.current = prereqKey;

    const checkEligibility = async () => {
      setLoading(true);
      try {
        // Set to track which prerequisite prompts the user has submitted to
        const submittedToPrereqs = new Set<string>();
        // Set to track which prerequisite prompts the user has a pass for
        const passedPrereqs = new Set<string>();

        // 1. Query submissions for all prerequisite prompts
        // Firestore 'in' query supports up to 30 values
        const batchSize = 30;
        for (let i = 0; i < uniquePrereqIds.length; i += batchSize) {
          const batch = uniquePrereqIds.slice(i, i + batchSize);
          const submissionsQuery = query(
            collection(db, 'submissions'),
            where('requestId', 'in', batch)
          );
          const submissionsSnap = await getDocs(submissionsQuery);
          submissionsSnap.forEach((subDoc) => {
            const data = subDoc.data();
            const matchesUid = userUid && (
              data.uploaderUid === userUid || data.originalUploaderPub === userUid
            );
            const matchesEmail = userEmail && data.uploaderEmail && 
              data.uploaderEmail.toLowerCase() === userEmail.toLowerCase();
            
            if (matchesUid || matchesEmail) {
              submittedToPrereqs.add(data.requestId);
            }
          });
        }

        // 2. Check hasPass on each prerequisite prompt's participants map
        await Promise.all(
          uniquePrereqIds.map(async (prereqId) => {
            const prereqDocRef = doc(db, 'requests', prereqId);
            const prereqSnap = await getDoc(prereqDocRef);
            if (prereqSnap.exists()) {
              const prereqData = prereqSnap.data() as Prompt;
              const participants = prereqData.participants || {};
              if (userUid && participants[userUid]?.hasPass) {
                passedPrereqs.add(prereqId);
              }
            }
          })
        );

        // 3. Build eligibility map
        const map = new Map<string, boolean>();
        prompts.forEach(p => {
          if (!p.id) return;
          if (!p.prerequisitePromptId) {
            // No prerequisite → always eligible
            map.set(p.id, true);
          } else {
            // Eligible if submitted to OR has pass on the prerequisite
            const isEligible = submittedToPrereqs.has(p.prerequisitePromptId) ||
                               passedPrereqs.has(p.prerequisitePromptId);
            map.set(p.id, isEligible);
          }
        });

        setEligibility(map);
      } catch (err) {
        console.error('Error checking prerequisite eligibility:', err);
        // On error, default all prerequisite prompts to not eligible (safe default)
        const map = new Map<string, boolean>();
        prompts.forEach(p => {
          if (p.id) map.set(p.id, !p.prerequisitePromptId);
        });
        setEligibility(map);
      } finally {
        setLoading(false);
      }
    };

    checkEligibility();
  }, [prompts, userUid, userEmail]);

  return { eligibility, loading };
}
