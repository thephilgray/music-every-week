import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';

interface PointEvent {
    id: string;
    amount: number;
    x: number;
    y: number;
}

export function PointsAnimation() {
    const [events, setEvents] = useState<PointEvent[]>([]);

    useEffect(() => {
        const handlePointsAdded = (e: Event) => {
            const customEvent = e as CustomEvent<{ amount: number }>;
            
            // Generate some random variation for position so they don't stack perfectly
            const xOffset = Math.random() * 40 - 20; 
            const yOffset = Math.random() * 20 - 10;
            
            const newEvent: PointEvent = {
                id: crypto.randomUUID(),
                amount: customEvent.detail.amount,
                x: window.innerWidth / 2 + xOffset, // Center roughly
                y: window.innerHeight / 2 + yOffset, 
            };

            setEvents(prev => [...prev, newEvent]);

            // Remove the animation element after it finishes (1.5s)
            setTimeout(() => {
                setEvents(prev => prev.filter(ev => ev.id !== newEvent.id));
            }, 1500);
        };

        window.addEventListener('pointsAdded', handlePointsAdded);
        return () => window.removeEventListener('pointsAdded', handlePointsAdded);
    }, []);

    if (events.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-[9999]">
            {events.map(event => (
                <div 
                    key={event.id}
                    className="absolute animate-float-up flex items-center gap-1 text-yellow-400 font-black text-3xl md:text-4xl drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]"
                    style={{ 
                        left: `${event.x}px`, 
                        top: `${event.y}px`,
                        fontFamily: '"Courier New", Courier, monospace',
                        transform: 'translate(-50%, -50%)',
                        WebkitTextStroke: '2px #b45309' // Outlined text effect
                    }}
                >
                    <Star className="w-8 h-8 md:w-10 md:h-10 fill-yellow-400 text-yellow-500" />
                    <span>+{event.amount}</span>
                </div>
            ))}
        </div>
    );
}
