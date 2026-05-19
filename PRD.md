一、MVP PRD
1. Product Name

Agentic KYC Platform MVP

2. Product Goal

提供一个可配置的尽调平台，帮助企业完成：

企业客户 / 商家 / 供应商 onboarding
企业主体核验
制裁 / PEP / adverse media 筛查
UBO / 控制权识别
风险评分
人工复核与审批
审计留痕
3. MVP Scope
In Scope

MVP 只做这几个核心能力：

Case 创建与状态流转
企业资料收集
文档上传与解析
企业注册信息核验
名单筛查
UBO 信息录入与解析
风险评分
Agent 辅助生成 case summary
人工审批
审计日志
周期复审提醒
Out of Scope

第一版先不做：

个人 KYC 全流程
银行交易监控
SAR/STR filing
多国家深度本地监管差异
完整 payment AML suite
自动最终审批
复杂 graph intelligence beyond ownership basics
实时持续名单流式监控
4. Target Users
Primary Users
Compliance analyst
KYC ops analyst
Vendor onboarding analyst
Merchant risk analyst
Operations manager
Secondary Users
Compliance manager
Sales / RM / onboarding coordinator
Internal admin / policy admin
External User
客户企业联系人 / 商家 / 供应商
用于提交资料和补件
5. Core Use Cases
Use Case 1: New Business Onboarding

用户提交企业基本信息和文档，系统自动完成：

数据标准化
企业主体核验
名单筛查
风险评分
生成建议结果
提交人工审批
Use Case 2: Missing Documents Follow-up

系统识别缺件，自动生成补件清单，并通知客户补交。

Use Case 3: High-Risk Escalation

若命中 sanctions/PEP/adverse media 或 UBO 结构复杂，则自动升级人工复核。

Use Case 4: Periodic Refresh

当客户到达复审日期，系统自动创建 refresh case，要求更新资料并重新筛查。

6. User Stories
Analyst
作为 analyst，我希望看到一个 case 的全部证据和风险点，方便快速判断。
作为 analyst，我希望系统自动告诉我还缺什么材料。
作为 analyst，我希望 agent 先生成 summary，而不是我从 20 个文档里自己翻。
作为 analyst，我希望知道系统为什么给出 high risk。
Manager
作为 manager，我希望看到 team 的 case SLA、pending cases、high-risk distribution。
作为 manager，我希望能配置风险规则和 EDD trigger。
External Customer
作为客户联系人，我希望通过 portal 上传资料，知道哪些材料还没交。
作为客户联系人，我希望系统明确告诉我为什么被要求补件。
7. Functional Requirements
7.1 Case Management

系统需要支持：

创建 case
关联客户实体
分配 owner
更新状态
添加评论
升级审批
拒绝 / 通过 / 退回补件
Case Status

建议 MVP 状态：

initiated
awaiting_documents
intake_review
verification_in_progress
screening_in_progress
risk_assessment_in_progress
pending_human_review
pending_manager_approval
approved
rejected
refresh_due
closed
7.2 External Intake Portal

支持外部客户填写：

公司名称
注册号
国家/州
注册地址
营业地址
网站
业务描述
授权联系人
董事
股东
UBO
预期业务规模
上传文档
支持上传文档类型
Certificate of incorporation
Tax ID / EIN proof
Good standing
Articles / formation docs
Ownership chart
Director list
ID of beneficial owner
Proof of address
Business license
Optional supporting materials
7.3 Document Processing

系统应支持：

文件上传
文档分类
OCR / parsing
字段提取
原始文件留存
提取结果人工修正

输出统一 canonical fields。

7.4 Business Verification

系统应支持调用外部验证工具或人工录入结果，完成：

公司是否注册存在
是否 active/good standing
注册信息是否匹配
地址是否匹配
董事 / 注册号是否合理
7.5 Screening

系统应支持：

sanctions screening
PEP screening
adverse media screening
internal watchlist screening

每个筛查结果需要保存：

query input
matched entity
match confidence
result type
analyst disposition
evidence link
7.6 UBO / Ownership

系统需支持：

录入股东和持股比例
录入控制人
生成 ownership tree
标记 UBO candidate
标记复杂结构
标记 unresolved ownership
7.7 Risk Scoring

系统应基于规则输出 risk level：

输入维度
jurisdiction risk
industry risk
ownership complexity
sanctions/PEP/media result
document completeness
business model risk
website availability
expected volume
high-risk exposure flags
输出
low / medium / high / prohibited
score
triggered rules
next action recommendation
7.8 Human Review

reviewer console 需要支持：

查看 summary
查看所有 documents
查看筛查结果
查看 ownership tree
查看 risk factors
approve / reject / request more info / escalate
填写 decision note
7.9 Audit Trail

所有关键动作必须可追踪：

谁上传了什么
谁改了字段
哪个 agent 跑了什么任务
哪条规则触发了
谁做了审批
审批理由是什么
7.10 Refresh / Reminder

系统需支持：

设置 review due date
到期自动提醒
自动创建 refresh case
重新筛查
更新 risk rating
8. Non-Functional Requirements
Security
role-based access control
encryption at rest
encryption in transit
document access control
audit logging
Reliability
tool execution retry
idempotent workflow jobs
async processing for OCR / screening
Explainability
every recommendation must have evidence and rule trace
Performance
case summary generation < 30s
tool job retry with queue
screening / OCR async completion
9. Success Metrics
Product Metrics
case completion time
analyst review time saved
% cases auto-prepared for review
% missing-doc cases detected automatically
% high-risk cases correctly escalated
false escalation rate
approval turnaround time
refresh completion rate
MVP Internal Metrics
average tool success rate
agent summary acceptance rate
% cases requiring manual field correction
% screening hits resolved without escalation
10. MVP Release Milestones
Milestone 1
case model
intake portal
doc upload
manual review UI
Milestone 2
OCR/parsing
verification tools
screening tools
risk engine v1
Milestone 3
agent summary
ownership view
escalation workflow
audit logs
Milestone 4
refresh jobs
policy config UI lite
dashboard
二、系统架构图

我先给你文本版，再给你 Mermaid 版。

1. High-Level Components
Frontend
External Intake Portal
Analyst Review Console
Manager Dashboard
Admin Policy Console
Backend Services
API Gateway
Auth Service
Case Management Service
Workflow Orchestrator
Agent Orchestrator
Tool Gateway
Document Processing Service
Entity Normalization Service
Risk Engine
Policy Engine
Notification Service
Audit Service
Data Stores
PostgreSQL
Object Storage
Redis / Queue
Graph DB
Optional Vector DB
2. Data Flow
External onboarding flow
客户在 portal 填写企业资料
文档上传到 object storage
Case service 创建 case
Workflow engine 生成 tasks
Document service 做 OCR / extraction
Verification / screening tools 异步执行
Ownership agent 解析 UBO
Risk engine 打分
Summary agent 输出 case summary
Analyst review console 展示结果
Reviewer 作出决定
Audit service 记录全过程
3. Mermaid 架构图
4. 推荐技术拆分
Backend
FastAPI / Node.js
PostgreSQL
Redis + Celery / BullMQ
S3/GCS object storage
Neo4j for ownership graph
Temporal / LangGraph / custom workflow engine
Agent Layer
LLM orchestration layer
strict tool calling
prompt templates + policy retrieval
structured JSON outputs only
Frontend
React / Next.js
Analyst workbench
Evidence viewer
Diff and override interface
三、Agent Roles

我建议你第一版做 6 个 agent，够用了。

1. Intake Agent
目标

检查 case 是否完整，生成缺件和缺字段列表。

输入
form data
uploaded docs
customer type
jurisdiction
policy requirements
输出
missing fields
missing docs
intake completeness score
next actions
典型任务
判断企业资料是否齐全
判断 required docs 是否缺失
输出给客户的补件清单
为什么重要

这是最容易节省 analyst 时间的一层。

2. Verification Agent
目标

整合文档提取结果和外部验证结果，判断信息是否一致。

输入
extracted company fields
business registry result
address verification result
document metadata
输出
matched / mismatched fields
anomalies
confidence score
verification summary
典型任务
公司名称是否一致
注册号是否一致
地址是否合理
证照是否疑似无效
3. Screening Agent
目标

处理 sanctions / PEP / adverse media 结果，并做初步消歧。

输入
company name
directors
UBO names
screening results
输出
potential hits
likely false positives
escalated hits
screening narrative
典型任务
区分同名误报
把模糊命中归类
输出需人工复核的命中项
4. Ownership Agent
目标

解析股权结构和控制关系，识别 UBO / control person。

输入
shareholder list
ownership percentages
uploaded ownership chart
director/control info
输出
ownership tree
UBO candidates
control person candidates
complexity flags
unresolved ownership issues
典型任务
找出直接持股与间接持股
标识超过阈值的自然人
标记多层离岸、信托、 nominee 等复杂情况
5. Risk Agent
目标

基于规则和前面 agent 的结果，输出风险等级和建议路线。

输入
verification output
screening output
ownership output
business profile
policy rules
输出
risk score
risk level
triggered rules
EDD required yes/no
recommended disposition
典型任务
low / medium / high 分类
判断是否要升级合规
生成 structured rationale
6. Decision Support Agent
目标

把 case 变成 analyst 能快速审的 summary。

输入
all prior agent outputs
raw evidence links
policy results
输出
executive summary
open issues
recommendation
reviewer checklist
典型任务

输出类似：

Entity verified: yes
Screening: no true hit identified
UBO: one natural person at 80%
Risk: medium due to cross-border exposure
Missing items: source of funds clarification
Recommended next action: request additional documentation
7. Optional QA Agent

MVP 可以先弱化，但建议后面加。

目标

检查前面 agent 的输出是否漏项、矛盾或无证据支持。

输出
unsupported claims
missing mandatory checks
policy gaps
四、Agent Collaboration Flow
五、Workflow 设计
1. New Business Case Workflow
Phase 1 Intake
create case
collect fields
upload docs
run intake agent
notify missing items if needed
Phase 2 Verification
OCR / extraction
business verification
address check
data normalization
verification agent output
Phase 3 Screening
run sanctions/PEP/media screening
screening agent disambiguation
Phase 4 Ownership
parse ownership
identify UBO / control person
mark complex structure
Phase 5 Risk
evaluate policy rules
calculate risk
trigger EDD if applicable
Phase 6 Review
generate summary
assign reviewer
approve / reject / request more info / escalate
Phase 7 Close / Refresh
set review cycle
archive case outcome
schedule refresh reminder
六、数据表设计

我按 PostgreSQL 主库来设计。

1. organizations

企业主实体表

CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    legal_name TEXT NOT NULL,
    normalized_name TEXT,
    registration_number TEXT,
    tax_id TEXT,
    incorporation_country TEXT,
    incorporation_state TEXT,
    incorporation_date DATE,
    registered_address TEXT,
    operating_address TEXT,
    website TEXT,
    business_description TEXT,
    industry_code TEXT,
    status TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
2. cases

case 主表

CREATE TABLE cases (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    case_type TEXT NOT NULL, -- onboarding, refresh, remediation
    customer_type TEXT NOT NULL, -- business, merchant, vendor, partner
    jurisdiction TEXT,
    status TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    assigned_to UUID,
    risk_level TEXT,
    risk_score NUMERIC,
    policy_pack_version TEXT,
    opened_at TIMESTAMP NOT NULL,
    due_at TIMESTAMP,
    closed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
3. case_contacts

case 对接人 / 授权联系人

CREATE TABLE case_contacts (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role_title TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL
);
4. parties

参与方表，统一抽象个人/实体

CREATE TABLE parties (
    id UUID PRIMARY KEY,
    party_type TEXT NOT NULL, -- individual, business
    legal_name TEXT NOT NULL,
    normalized_name TEXT,
    date_of_birth DATE,
    nationality TEXT,
    registration_number TEXT,
    country TEXT,
    address TEXT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
5. case_parties

case 与 party 的关系表

CREATE TABLE case_parties (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    party_id UUID REFERENCES parties(id),
    relation_type TEXT NOT NULL, 
    -- director, shareholder, ubo_candidate, signatory, control_person
    ownership_percentage NUMERIC,
    control_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL
);
6. documents

文档元数据表

CREATE TABLE documents (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    organization_id UUID REFERENCES organizations(id),
    uploaded_by UUID,
    document_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mime_type TEXT,
    file_size BIGINT,
    processing_status TEXT,
    extracted_fields JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
7. document_reviews

文档复核记录

CREATE TABLE document_reviews (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id),
    reviewed_by UUID,
    review_status TEXT, -- accepted, rejected, needs_manual_fix
    notes TEXT,
    corrected_fields JSONB,
    created_at TIMESTAMP NOT NULL
);
8. verification_results

核验结果表

CREATE TABLE verification_results (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    verification_type TEXT NOT NULL, 
    -- business_registry, address, tax_id, document_authenticity
    provider_name TEXT,
    request_payload JSONB,
    raw_response JSONB,
    normalized_result JSONB,
    status TEXT,
    confidence NUMERIC,
    created_at TIMESTAMP NOT NULL
);
9. screening_results

名单筛查结果表

CREATE TABLE screening_results (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    party_id UUID REFERENCES parties(id),
    screening_type TEXT NOT NULL, 
    -- sanctions, pep, adverse_media, watchlist
    provider_name TEXT,
    query_name TEXT,
    matched_name TEXT,
    match_score NUMERIC,
    disposition TEXT, 
    -- unresolved, false_positive, escalated, true_match
    raw_response JSONB,
    evidence JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
10. ownership_structures

ownership 结构表

CREATE TABLE ownership_structures (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    version INT NOT NULL,
    structure_json JSONB NOT NULL,
    complexity_score NUMERIC,
    unresolved_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL
);
11. risk_assessments

风险评分表

CREATE TABLE risk_assessments (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    engine_version TEXT,
    total_score NUMERIC,
    risk_level TEXT,
    triggered_rules JSONB,
    rationale JSONB,
    edd_required BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL
);
12. policy_evaluations

规则命中记录

CREATE TABLE policy_evaluations (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    policy_pack_version TEXT,
    rule_code TEXT NOT NULL,
    rule_name TEXT,
    evaluation_result BOOLEAN,
    evaluation_details JSONB,
    created_at TIMESTAMP NOT NULL
);
13. agent_runs

agent 执行记录

CREATE TABLE agent_runs (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    agent_name TEXT NOT NULL,
    input_payload JSONB,
    output_payload JSONB,
    status TEXT,
    model_name TEXT,
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP
);
14. tasks

任务表

CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_to UUID,
    due_at TIMESTAMP,
    payload JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
15. decisions

最终决策表

CREATE TABLE decisions (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    decision_type TEXT NOT NULL, 
    -- approve, reject, request_more_info, escalate
    decided_by UUID,
    decision_reason TEXT,
    decision_notes TEXT,
    created_at TIMESTAMP NOT NULL
);
16. audit_events

审计日志表

CREATE TABLE audit_events (
    id UUID PRIMARY KEY,
    case_id UUID REFERENCES cases(id),
    actor_type TEXT NOT NULL, -- user, system, agent
    actor_id TEXT,
    event_type TEXT NOT NULL,
    event_payload JSONB,
    created_at TIMESTAMP NOT NULL
);
17. review_cycles

周期复审表

CREATE TABLE review_cycles (
    id UUID PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id),
    case_id UUID REFERENCES cases(id),
    next_review_at TIMESTAMP,
    review_frequency_months INT,
    status TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
七、Graph DB 设计

如果你用 Neo4j，建议节点和边这样设计：

Nodes
Organization
Individual
Case
Document
Relationships
OWNS
CONTROLS
DIRECTOR_OF
SIGNATORY_OF
UBO_OF
RELATED_TO_CASE
SUBMITTED_DOCUMENT
示例
(:Individual {name:"John Doe"})-[:OWNS {pct:80}]->(:Organization {name:"ABC LLC"})
(:Individual {name:"John Doe"})-[:UBO_OF]->(:Organization {name:"ABC LLC"})
(:Individual {name:"Jane Smith"})-[:DIRECTOR_OF]->(:Organization {name:"ABC LLC"})

这个图层主要给：

ownership agent
analyst relationship view
future portfolio risk analysis
八、API 设计建议
Core APIs
Case APIs
POST /cases
GET /cases/{id}
PATCH /cases/{id}
POST /cases/{id}/submit
POST /cases/{id}/decision
Document APIs
POST /cases/{id}/documents
GET /cases/{id}/documents
POST /documents/{id}/reprocess
Screening APIs
POST /cases/{id}/screening/run
GET /cases/{id}/screening/results
Risk APIs
POST /cases/{id}/risk/evaluate
GET /cases/{id}/risk
Agent APIs
POST /cases/{id}/agents/intake
POST /cases/{id}/agents/summary
GET /cases/{id}/agent-runs
Task APIs
GET /tasks
PATCH /tasks/{id}
九、Policy Pack 设计

建议你不要把规则写死在代码里。

示例 policy_pack
{
  "version": "v1-us-business-onboarding",
  "customer_type": "business",
  "required_documents": [
    "certificate_of_incorporation",
    "tax_id_proof",
    "ownership_chart"
  ],
  "risk_rules": [
    {
      "code": "HR_COUNTRY_EXPOSURE",
      "condition": "organization.country in high_risk_country_list",
      "score": 40
    },
    {
      "code": "PEP_TRUE_MATCH",
      "condition": "screening.pep_true_match == true",
      "score": 60
    },
    {
      "code": "OWNERSHIP_COMPLEX",
      "condition": "ownership.complexity_score > 70",
      "score": 30
    }
  ],
  "edd_triggers": [
    "PEP_TRUE_MATCH",
    "SANCTIONS_TRUE_MATCH",
    "OWNERSHIP_UNRESOLVED"
  ],
  "review_cycles": {
    "low": 36,
    "medium": 12,
    "high": 6
  }
}
十、Reviewer UI 应该长什么样

我建议 reviewer case page 分 6 个 panel：

Panel 1: Overview
organization
case status
SLA
assigned owner
recommendation
Panel 2: Summary
decision support agent summary
open issues
missing docs
Panel 3: Verification
registry match
address match
doc consistency
Panel 4: Screening
sanctions
PEP
media hits
analyst dispositions
Panel 5: Ownership
ownership tree
UBO candidates
complexity flags
Panel 6: Risk & Decision
risk score
triggered rules
approve / reject / request info / escalate
十一、MVP 的最小交付团队

如果你真要做，我建议至少：

1 backend engineer
1 frontend engineer
1 platform / workflow engineer
1 AI engineer
1 product / domain owner
1 part-time compliance SME
十二、你第一版真正该追求的产品效果

不是“AI 替代 analyst”，而是：

analyst 不再手工整理 case
analyst 不再自己比对 10 份文档
analyst 更快发现缺件
analyst 更快判断是否 escalate
manager 有统一 case pipeline
整个流程有审计留痕
十三、建议你的开发顺序
Sprint 1
case schema
organization schema
document upload
basic review UI
Sprint 2
OCR/extraction
verification result ingestion
screening result ingestion
Sprint 3
risk scoring rules v1
task queue
audit logs
Sprint 4
intake agent
summary agent
ownership tree viewer
Sprint 5
decision workflow
manager approval
refresh scheduler