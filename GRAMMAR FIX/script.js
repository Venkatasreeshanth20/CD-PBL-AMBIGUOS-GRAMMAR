// GrammarFix – Dangling-Else Resolver
// Author: Compiler Design Hackathon 2026
// All logic is implemented in-browser, no backend required.

// --- Predefined Test Cases ---
const testCases = [
    {
        name: "Simple if-else",
        code: "if (E) statement else statement"
    },
    {
        name: "Nested if without else",
        code: "if (E) if (E) statement"
    },
    {
        name: "Nested if-else inside if",
        code: "if (E) if (E) statement else statement"
    },
    {
        name: "Multiple nesting with else",
        code: "if (E) if (E) if (E) statement else statement else statement"
    },
    {
        name: "Ambiguous triple nesting",
        code: "if (E) if (E) statement else if (E) statement else statement"
    }
];

// --- Grammar Definitions ---
const originalGrammar = `S → if (E) S\nS → if (E) S else S\nS → statement`;
const transformedGrammar = `S → M | U\nM → if (E) M else M | statement\nU → if (E) S\nU → if (E) M else U`;
const transformedGrammarExplanation = `
S → M | U\n  S can be either a Matched (M) or Unmatched (U) statement.\nM → if (E) M else M | statement\n  Matched: Every if has a matching else.\n  - if (E) M else M: An if-else where both branches are matched.\n  - statement: Any other statement.\nU → if (E) S\n  Unmatched: An if without a matching else.\nU → if (E) M else U\n  An if-else where the else matches the nearest unmatched if.`;

// --- Utility Functions ---
function escapeHTML(str) {
    return str.replace(/[&<>\"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;','\'':'&#39;'}[c];
    });
}

// --- Parse Tree Node ---
class ParseNode {
    constructor(label, children = [], highlight = false) {
        this.label = label;
        this.children = children;
        this.highlight = highlight; // For highlighting else-attachment
    }
}

// Lex conditions after `if` as balanced parenthesized expressions. Everything
// else is kept as statement text until the next grammar keyword.
function tokenize(input) {
    const tokens = [];
    let position = 0;
    let ifNumber = 0;

    while (position < input.length) {
        if (/\s/.test(input[position])) {
            position += 1;
            continue;
        }

        const keyword = /^(if|else)\b/.exec(input.slice(position));
        if (keyword && keyword[1] === 'else') {
            tokens.push({ type: 'ELSE', text: 'else' });
            position += keyword[0].length;
            continue;
        }
        if (keyword && keyword[1] === 'if') {
            position += keyword[0].length;
            while (/\s/.test(input[position] || '')) position += 1;
            if (input[position] !== '(') {
                return { tokens: [], error: 'Expected a parenthesized condition after `if`.' };
            }

            const conditionStart = position + 1;
            let depth = 1;
            position += 1;
            while (position < input.length && depth > 0) {
                if (input[position] === '(') depth += 1;
                if (input[position] === ')') depth -= 1;
                position += 1;
            }
            if (depth !== 0) {
                return { tokens: [], error: 'Unclosed condition: expected `)`.' };
            }

            const condition = input.slice(conditionStart, position - 1).trim();
            if (!condition) {
                return { tokens: [], error: 'The condition inside `if (...)` cannot be empty.' };
            }
            ifNumber += 1;
            tokens.push({ type: 'IF', id: ifNumber });
            tokens.push({ type: 'COND', text: condition });
            continue;
        }

        const start = position;
        while (position < input.length && !/^(if|else)\b/.test(input.slice(position))) {
            position += 1;
        }
        const statement = input.slice(start, position).trim();
        if (statement) tokens.push({ type: 'STMT', text: statement });
    }

    if (tokens.length === 0) return { tokens: [], error: 'Enter an if statement or a statement body.' };
    return { tokens, error: null };
}

function parseAmbiguous(tokens) {
    const memo = new Map();

    function parseAt(position) {
        if (memo.has(position)) return memo.get(position);
        const parses = [];
        const current = tokens[position];

        if (current && current.type === 'STMT') {
            parses.push({ node: new ParseNode('S', [new ParseNode(current.text)]), end: position + 1 });
        }
        if (current && current.type === 'IF' && tokens[position + 1]?.type === 'COND') {
            const condition = tokens[position + 1];
            const bodyParses = parseAt(position + 2);
            for (const body of bodyParses) {
                const children = [new ParseNode(`if #${current.id}`), new ParseNode(`(${condition.text})`), body.node];
                parses.push({ node: new ParseNode('S', children), end: body.end });
                if (tokens[body.end]?.type === 'ELSE') {
                    for (const alternate of parseAt(body.end + 1)) {
                        parses.push({
                            node: new ParseNode('S', [
                                new ParseNode(`if #${current.id}`),
                                new ParseNode(`(${condition.text})`),
                                body.node,
                                new ParseNode(`else → if #${current.id}`, [], true),
                                alternate.node
                            ]),
                            end: alternate.end
                        });
                    }
                }
            }
        }

        memo.set(position, parses);
        return parses;
    }

    return parseAt(0).filter(parse => parse.end === tokens.length);
}

function parseTransformed(tokens) {
    const memo = new Map();

    function parseAt(position, context) {
        const key = `${context}:${position}`;
        if (memo.has(key)) return memo.get(key);
        const parses = [];
        const current = tokens[position];

        if (context === 'S') {
            parses.push(...parseAt(position, 'M'), ...parseAt(position, 'U'));
        } else if (current?.type === 'STMT' && context === 'M') {
            parses.push({ node: new ParseNode('M', [new ParseNode(current.text)]), end: position + 1 });
        } else if (current?.type === 'IF' && tokens[position + 1]?.type === 'COND') {
            const condition = tokens[position + 1];
            if (context === 'M') {
                for (const body of parseAt(position + 2, 'M')) {
                    if (tokens[body.end]?.type !== 'ELSE') continue;
                    for (const alternate of parseAt(body.end + 1, 'M')) {
                        parses.push({
                            node: new ParseNode('M', [
                                new ParseNode(`if #${current.id}`),
                                new ParseNode(`(${condition.text})`),
                                body.node,
                                new ParseNode(`else → if #${current.id}`, [], true),
                                alternate.node
                            ]),
                            end: alternate.end
                        });
                    }
                }
            } else if (context === 'U') {
                for (const body of parseAt(position + 2, 'S')) {
                    parses.push({
                        node: new ParseNode('U', [new ParseNode(`if #${current.id}`), new ParseNode(`(${condition.text})`), body.node]),
                        end: body.end
                    });
                }
                for (const body of parseAt(position + 2, 'M')) {
                    if (tokens[body.end]?.type !== 'ELSE') continue;
                    for (const alternate of parseAt(body.end + 1, 'U')) {
                        parses.push({
                            node: new ParseNode('U', [
                                new ParseNode(`if #${current.id}`),
                                new ParseNode(`(${condition.text})`),
                                body.node,
                                new ParseNode(`else → if #${current.id}`, [], true),
                                alternate.node
                            ]),
                            end: alternate.end
                        });
                    }
                }
            }
        }

        memo.set(key, parses);
        return parses;
    }

    return parseAt(0, 'S').filter(parse => parse.end === tokens.length);
}

// --- Parse Tree Renderer ---
function renderParseTree(node, depth = 0, highlightElse = false) {
    if (!node) return '';
    let html = `<div class="tree-node${node.highlight ? ' highlight-else' : ''}">`;
    html += `<span>${escapeHTML(node.label)}</span>`;
    if (node.children && node.children.length > 0) {
        html += '<div class="tree-children">';
        for (let child of node.children) {
            html += renderParseTree(child, depth + 1, node.highlight);
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

// --- UI Logic ---
function setStatus(msg, ambiguous, count) {
    const status = document.getElementById('ambiguity-status');
    status.textContent = msg + (typeof count === 'number' && count > 1 ? ` (${count} parses)` : '');
    status.className = 'status-indicator ' + (ambiguous ? 'ambiguous' : 'unambiguous');
}

function showError(msg) {
    document.getElementById('input-error').textContent = msg || '';
}

function resetUI() {
    document.getElementById('code-editor').value = '';
    document.getElementById('ambiguity-status').textContent = '';
    document.getElementById('ambiguity-status').className = 'status-indicator';
    document.getElementById('parse-tree-container').innerHTML = '';
    document.getElementById('explanation').innerHTML = '';
    showError('');
}

function loadTestCases() {
    const select = document.getElementById('test-cases');
    select.innerHTML = '<option value="">-- Select a test case --</option>';
    testCases.forEach((tc, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = tc.name;
        select.appendChild(opt);
    });
}

function handleLoadTest() {
    const select = document.getElementById('test-cases');
    const idx = select.value;
    if (idx !== '') {
        document.getElementById('code-editor').value = testCases[idx].code;
        showError('');
    }
}

function explainNearestUnmatchedIf() {
    return `<b>Nearest-Unmatched-If Rule:</b> <br>Each <b>else</b> is paired with the closest previous <b>if</b> that does not already have an <b>else</b>. This resolves ambiguity by always attaching <b>else</b> to the nearest unmatched <b>if</b> above it.`;
}

function explainAmbiguity(count) {
    if (count > 1) {
        return `<b>Ambiguity Detected:</b> There are <b>${count}</b> valid parse trees for this input using the original grammar. This means the statement is ambiguous.`;
    } else {
        return `<b>No Ambiguity:</b> There is only one valid parse tree for this input.`;
    }
}

function explainGrammarTransformation() {
    return `<b>Grammar Transformation:</b><br>
    The original grammar allows ambiguity because <b>else</b> can match multiple <b>if</b> statements. The transformed grammar splits statements into <b>Matched (M)</b> and <b>Unmatched (U)</b> to enforce the nearest-unmatched-if rule and remove ambiguity.`;
}

function analyzeInput() {
    const input = document.getElementById('code-editor').value.trim();
    if (!input) {
        showError('Please enter code to analyze.');
        return;
    }
    const { tokens, error } = tokenize(input);
    if (error) {
        showError(error);
        setStatus('Invalid input', true);
        document.getElementById('parse-tree-container').innerHTML = `<span class="error-message">${escapeHTML(error)}</span>`;
        document.getElementById('explanation').innerHTML = `<b>Analysis stopped:</b> ${escapeHTML(error)}<br><br>Use an <code>if (condition)</code> statement, optionally followed by <code>else</code>. Conditions may contain normal code expressions, and statement bodies may contain code such as <code>x = 1;</code>.`;
        return;
    }
    // Ambiguity detection
    const ambiguousParses = parseAmbiguous(tokens);
    if (ambiguousParses.length === 0) {
        const message = 'The input does not match the supported grammar. Check that each if has a parenthesized condition and a statement body, and that each else has a body.';
        showError(message);
        setStatus('Invalid statement', true);
        document.getElementById('parse-tree-container').innerHTML = `<span class="error-message">${escapeHTML(message)}</span>`;
        document.getElementById('explanation').innerHTML = `<b>Analysis stopped:</b> ${escapeHTML(message)}<br><br>The analyzer accepts nested <code>if (condition) statement</code> forms, with optional <code>else statement</code> clauses.`;
        return;
    }
    const ambiguous = ambiguousParses.length > 1;
    setStatus(ambiguous ? 'Ambiguity Detected' : 'No Ambiguity', ambiguous, ambiguousParses.length);
    // Parse tree visualization
    let parseTreeHtml = '';
    if (ambiguousParses.length === 0) {
        parseTreeHtml = '<span class="error-message">No valid parse tree found for this input.</span>';
    } else if (ambiguous) {
        parseTreeHtml = '<b>Competing Parse Trees:</b><br>';
        ambiguousParses.forEach((t, i) => {
            parseTreeHtml += `<div class="tree-block"><b>Parse ${i+1}:</b>${renderParseTree(t.node)}</div>`;
        });
    } else {
        parseTreeHtml = '<b>Parse Tree:</b>' + renderParseTree(ambiguousParses[0].node);
    }
    // Parse tree for transformed grammar
    const resolvedParses = parseTransformed(tokens);
    if (resolvedParses.length > 0) {
        parseTreeHtml += '<hr><b>Resolved Parse Tree (Nearest-Unmatched-If):</b>';
        parseTreeHtml += renderParseTree(resolvedParses[0].node);
    }
    document.getElementById('parse-tree-container').innerHTML = parseTreeHtml;
    // Explanation
    const ifCount = tokens.filter(token => token.type === 'IF').length;
    const elseCount = tokens.filter(token => token.type === 'ELSE').length;
    let explanation = `<ol class="analysis-steps">
        <li>Recognized ${ifCount} <code>if</code> statement${ifCount === 1 ? '' : 's'}, ${elseCount} <code>else</code> clause${elseCount === 1 ? '' : 's'}, and their parenthesized conditions and statement bodies.</li>
        <li>${explainAmbiguity(ambiguousParses.length)}</li>
        <li>${resolvedParses.length === 1 ? 'The matched/unmatched grammar produces one resolved parse tree.' : 'The transformed grammar could not produce a complete parse; check the input statement structure.'}</li>
    </ol>
    ${explainNearestUnmatchedIf()}<br><br>
    ${explainGrammarTransformation()}`;
    document.getElementById('explanation').innerHTML = explanation;
    showError('');
}

function showGrammars() {
    document.getElementById('original-grammar').textContent = originalGrammar;
    document.getElementById('transformed-grammar').textContent = transformedGrammar + '\n\n' + transformedGrammarExplanation;
}

function setup() {
    loadTestCases();
    showGrammars();
    document.getElementById('analyze-btn').onclick = analyzeInput;
    document.getElementById('reset-btn').onclick = resetUI;
    document.getElementById('load-test').onclick = handleLoadTest;
    resetUI();
}

// --- Tree Node Highlighting CSS ---
document.addEventListener('DOMContentLoaded', () => {
    setup();
    // Add CSS for highlighting else
    const style = document.createElement('style');
    style.textContent = `.tree-node { display: inline-block; margin: 4px; padding: 2px 6px; border-radius: 6px; background: #e0e7ff; color: #1e355e; font-weight: 500; }
    .tree-children { display: flex; flex-direction: row; justify-content: center; margin-top: 2px; }
    .tree-node.highlight-else > span { background: #fee2e2; color: #b91c1c; border-radius: 4px; padding: 0 4px; }
    .tree-block { margin-bottom: 12px; }`;
    document.head.appendChild(style);
});
