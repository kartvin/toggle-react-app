import './App.css';

import React, { useState } from 'react';

function App() {
  const [inputType, setInputType] = useState('directory');
  const [directory, setDirectory] = useState('');
  const [repo, setRepo] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [fileDiffs, setFileDiffs] = useState([]);
  const [summary, setSummary] = useState('');
  const [fileList, setFileList] = useState([]);
  const [postCommand, setPostCommand] = useState('mvn clean install -DskipTests=true');
  const [buildOutput, setBuildOutput] = useState('');
  const [buildStatus, setBuildStatus] = useState('');
  const [showDetailed, setShowDetailed] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browsePath, setBrowsePath] = useState('/');
  const [browseDirs, setBrowseDirs] = useState([]);

  const browseTo = async (dirPath) => {
    try {
      const res = await fetch(`http://localhost:4000/browse?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      if (data.error) return;
      setBrowsePath(data.path);
      setBrowseDirs(data.dirs);
    } catch (e) { /* ignore */ }
  };

  const openBrowser = () => {
    setShowBrowser(true);
    browseTo(directory || '/');
  };

  const selectFolder = () => {
    setDirectory(browsePath);
    setShowBrowser(false);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult('');
    setFileDiffs([]);
    setSummary('');
    setFileList([]);
    setBuildOutput('');
    setBuildStatus('');
    try {
      const res = await fetch('http://localhost:4000/remove-toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          directory,
          toggleName: name,
          postCommand
        })
      });
      const data = await res.json();
      if (data.success) {
        setResult(`Toggle removed from ${data.updated} files.`);
      } else {
        setResult(`Error: ${data.error || 'Unknown error'}`);
      }
      setFileDiffs(data.fileDiffs || []);
      setSummary(data.summary || '');
      setFileList(data.changedFiles || []);
      setBuildStatus(data.build || '');
      setBuildOutput(data.output || data.error || '');
    } catch (err) {
      setResult('Error contacting backend.');
      setFileDiffs([]);
      setSummary('');
      setFileList([]);
      setBuildOutput('');
      setBuildStatus('');
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h2>Toggle Deletion Form</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '500px' }}>
          <div>
            <label>
              <input
                type="radio"
                name="inputType"
                value="directory"
                checked={inputType === 'directory'}
                onChange={() => setInputType('directory')}
              />
              Project Directory
            </label>
            <label style={{ marginLeft: '1rem' }}>
              <input
                type="radio"
                name="inputType"
                value="repo"
                checked={inputType === 'repo'}
                onChange={() => setInputType('repo')}
              />
              Repo Location
            </label>
          </div>
          {inputType === 'directory' ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Project directory path"
                value={directory}
                onChange={e => setDirectory(e.target.value)}
                required
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button type="button" onClick={openBrowser} style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '12px',
                border: '1px solid #d1d5db',
                background: '#f9fafb',
                cursor: 'pointer',
                fontSize: '1.1rem',
                lineHeight: 1,
                color: '#555',
                flexShrink: 0
              }} title="Browse folders">📁</button>
            </div>
          ) : (
            <input
              type="text"
              placeholder="Repo Location"
              value={repo}
              onChange={e => setRepo(e.target.value)}
              required
            />
          )}
          {/* Toggle name field */}
          <input
            type="text"
            placeholder="Toggle Name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          {/* Post-refactor command */}
          <input
            type="text"
            placeholder="Post-refactor command (e.g. mvn clean package)"
            value={postCommand}
            onChange={e => setPostCommand(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '14px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showDetailed}
              onChange={e => setShowDetailed(e.target.checked)}
            />
            Show detailed output
          </label>
          <button type="submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        {result && <div style={{ marginTop: '1rem', color: 'green' }}>{result}</div>}
      </header>

      {/* Folder Browser Modal */}
      {showBrowser && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setShowBrowser(false)}>
          <div style={{
            background: '#fff', borderRadius: '16px', padding: '1.5rem', width: '90%', maxWidth: '500px', maxHeight: '70vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0072CE', marginBottom: '0.75rem' }}>Select Folder</div>
            <div style={{
              background: '#f4f6f8', borderRadius: '8px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem',
              fontSize: '0.85rem', color: '#333', wordBreak: 'break-all'
            }}>{browsePath}</div>
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '1rem' }}>
              {browsePath !== '/' && (
                <div
                  onClick={() => browseTo(browsePath.split('/').slice(0, -1).join('/') || '/')}
                  style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', color: '#555', fontSize: '0.9rem' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e8f0fe'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >📁 ..</div>
              )}
              {browseDirs.map(d => (
                <div key={d}
                  onClick={() => browseTo(browsePath === '/' ? '/' + d : browsePath + '/' + d)}
                  style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.9rem' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e8f0fe'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >📁 {d}</div>
              ))}
              {browseDirs.length === 0 && (
                <div style={{ padding: '1rem', color: '#999', textAlign: 'center', fontSize: '0.85rem' }}>No subdirectories</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowBrowser(false)} style={{
                padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer'
              }}>Cancel</button>
              <button type="button" onClick={selectFolder} style={{
                padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', background: '#0072CE', color: '#fff', cursor: 'pointer', fontWeight: 600
              }}>Select</button>
            </div>
          </div>
        </div>
      )}

      {(loading || fileDiffs.length > 0 || buildOutput || summary) && (
        <div style={{
          margin: '2rem auto',
          maxWidth: '900px',
          width: '100%',
          background: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: '"Courier New", Courier, monospace',
          fontSize: '13px',
          borderRadius: '8px',
          overflow: 'hidden',
          textAlign: 'left'
        }}>
          <div style={{
            background: '#333',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f', display: 'inline-block' }} />
            <span style={{ marginLeft: '8px', color: '#aaa', fontSize: '12px' }}>Refactor Output</span>
          </div>
          <div style={{ padding: '16px', maxHeight: '700px', overflowY: 'auto' }}>

            {/* Loader */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 1rem', gap: '1rem' }}>
                <div style={{
                  width: '36px', height: '36px', border: '3px solid #444', borderTop: '3px solid #569cd6',
                  borderRadius: '50%', animation: 'spin 1s linear infinite'
                }} />
                <div style={{ color: '#aaa', fontSize: '13px' }}>Analyzing codebase and removing toggle...</div>
              </div>
            )}

            {/* File Diffs / Full Content */}
            {fileDiffs.map((fileDiff, idx) => (
              <div key={idx} style={{ marginBottom: '2rem' }}>
                <div style={{
                  background: '#2d2d2d',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  color: '#569cd6',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  borderLeft: '3px solid #569cd6',
                  wordBreak: 'break-all'
                }}>
                  {fileDiff.file}
                </div>
                {showDetailed && (
                  <div style={{ padding: '0 8px', overflowX: 'auto' }}>
                    {fileDiff.diff.map((change, cIdx) => {
                      if (change.type === 'separator') {
                        return (
                          <div key={cIdx} style={{
                            color: '#555',
                            padding: '4px 0',
                            textAlign: 'center',
                            fontSize: '11px',
                            margin: '4px 0'
                          }}>• • •</div>
                        );
                      }
                      const colors = {
                        deleted: { color: '#f44747', bg: 'rgba(244,71,71,0.1)', prefix: '-' },
                        added: { color: '#4ec9b0', bg: 'rgba(78,201,176,0.1)', prefix: '+' },
                        context: { color: '#d4d4d4', bg: 'transparent', prefix: ' ' }
                      };
                      const style = colors[change.type] || colors.context;
                      const lineNum = change.origLine || change.newLine || '';
                      return (
                        <div key={cIdx} style={{
                          color: style.color,
                          background: style.bg,
                          padding: '1px 8px',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          borderRadius: '2px'
                        }}>
                          <span style={{ display: 'inline-block', width: '40px', textAlign: 'right', marginRight: '12px', color: '#555', fontSize: '11px' }}>{lineNum}</span>
                          <span style={{ marginRight: '8px' }}>{style.prefix}</span>
                          {change.line}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {/* Summary */}
            {summary && (
              <div style={{ marginTop: '2rem', borderTop: '2px solid #444', paddingTop: '1.5rem' }}>
                <div style={{
                  background: '#2d2d2d',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  color: '#dcdcaa',
                  fontWeight: 'bold',
                  fontSize: '14px',
                  borderLeft: '3px solid #dcdcaa'
                }}>Summary</div>
                <div style={{ padding: '0 12px' }}>
                  {summary.split('\n').map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <div key={i} style={{ height: '8px' }} />;
                    const isBullet = trimmed.startsWith('-') || trimmed.startsWith('•');
                    const bulletText = isBullet ? trimmed.replace(/^[-•]\s*/, '') : trimmed;
                    // Detect file paths (e.g. src/main/resources/file.yaml or FeatureToggle.java)
                    const fileMatch = bulletText.match(/^([^\s:]+\.\w{1,6})\s*[:—\-–]\s*(.*)/);
                    let bulletColor = '#d4d4d4';
                    if (/removed|deleted|cleanup/i.test(bulletText)) bulletColor = '#f44747';
                    else if (/compile|success|should build/i.test(bulletText)) bulletColor = '#4ec9b0';
                    else if (/changed|modified|updated/i.test(bulletText)) bulletColor = '#ce9178';
                    return (
                      <div key={i} style={{
                        color: bulletColor,
                        padding: '4px 0',
                        fontSize: '13px',
                        lineHeight: '1.7'
                      }}>
                        {isBullet && <span style={{ color: '#569cd6', marginRight: '8px' }}>●</span>}
                        {fileMatch ? (
                          <>
                            <span style={{ color: '#569cd6', fontWeight: 'bold' }}>{fileMatch[1]}</span>
                            <span style={{ color: '#666', margin: '0 6px' }}>—</span>
                            <span style={{ color: bulletColor }}>{fileMatch[2]}</span>
                          </>
                        ) : bulletText}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Build Output */}
            {buildOutput && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #444', paddingTop: '1rem' }}>
                <div style={{
                  color: buildStatus === 'fail' ? '#f44747' : '#4ec9b0',
                  fontWeight: 'bold',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}>
                  $ {postCommand} {buildStatus === 'fail' ? '— FAILED' : buildStatus === 'success' ? '— SUCCESS' : ''}
                </div>
                {showDetailed && (
                  <pre style={{
                    margin: 0,
                    color: buildStatus === 'fail' ? '#f44747' : '#d4d4d4',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.5'
                  }}>{buildOutput}</pre>
                )}
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

export default App;
