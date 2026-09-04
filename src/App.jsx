import React from 'react';
import { Route, Routes, BrowserRouter as Router } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import HomePage from './pages/HomePage';

function App() {
    // import.meta.env.BASE_URL mirrors vite.config.js's `base` option
    // ("/" in dev, "/netscope/" in production), so routes resolve correctly
    // whether the app is served at the domain root or under a GitHub Pages
    // project-page subpath.
    return (
        <Router basename={import.meta.env.BASE_URL}>
            <ScrollToTop />
            <Routes>
                <Route path="/" element={<HomePage />} />
            </Routes>
        </Router>
    );
}

export default App;
