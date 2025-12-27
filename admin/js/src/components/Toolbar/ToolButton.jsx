import React from 'react';
import './Toolbar.css';

function ToolButton({ tool, isActive, onClick }) {
    return (
        <button
            type="button"
            className={`plintus-tool-button ${isActive ? 'active' : ''}`}
            onClick={onClick}
            title={tool.label}
        >
            <i className={`fs-28 uil ${tool.icon}`}></i>
        </button>
    );
}

export default ToolButton;


