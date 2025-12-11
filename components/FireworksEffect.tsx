'use client';

import React, {useState, useEffect} from 'react';
import './FireworksEffect.css';

interface FireworksEffectProps {
    trigger: boolean;
}

const FireworksEffect: React.FC<FireworksEffectProps> = ({trigger}) => {
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        if (trigger) {
            setIsActive(true);
            const timer = setTimeout(() => setIsActive(false), 20000); // Animation duration to match CSS
            return () => clearTimeout(timer);
        }
    }, [trigger]);

    if (!isActive) {
        return null;
    }

    return (
        <div className="fireworks">
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
            <div className="firework"></div>
        </div>
    );
};

export default FireworksEffect;
