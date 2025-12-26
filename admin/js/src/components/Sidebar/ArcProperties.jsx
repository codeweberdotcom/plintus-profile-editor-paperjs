import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { formatLengthMM } from '../../utils/geometry';

function ArcProperties({ element }) {
    const { updateElement } = useEditorStore();
    
    // Вычисляем длину дуги
    const radius = element.radius || 0;
    const angle = element.angle || 90;
    const angleRad = (angle * Math.PI) / 180;
    const arcLength = radius * angleRad;
    const arcLengthText = formatLengthMM(arcLength);

    return (
        <div className="arc-properties">
            <h4>Arc Properties</h4>
            <div className="property-item">
                <label>Radius:</label>
                <span className="property-value">{Math.round(radius)}px</span>
            </div>
            <div className="property-item">
                <label>Angle:</label>
                <span className="property-value">{Math.round(angle)}°</span>
            </div>
            <div className="property-item">
                <label>Length:</label>
                <span className="property-value">{arcLengthText}</span>
            </div>
        </div>
    );
}

export default ArcProperties;

