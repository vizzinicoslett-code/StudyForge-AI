"""独立使用 Python 标准库核验 ZIP 的 CRC、清单、文件散列和凭据排除。"""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent.parent
archive = root.parent / '组号-StudyForgeAI-成员姓名-公开展示版.zip'
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None, '压缩包 CRC 校验失败'
    names = bundle.namelist()
    assert len(names) == len(set(names)), '存在重复文件名'
    assert all(name.startswith('submission/') and '..' not in name.split('/') for name in names)
    assert not any('node_modules' in name.split('/') or '.git' in name.split('/') for name in names)
    assert not any('artifacts' in name.split('/') or 'private-materials' in name.split('/') for name in names)
    assert not any(Path(name).name.startswith('.env') and Path(name).name != '.env.example' for name in names)
    assert len([name for name in names if name.startswith('submission/截图/') and name.endswith('.png')]) == 10
    course = [name for name in names if name.startswith('submission/课程作业材料/') and name.endswith('.md')]
    assert len(course) == 11, '9 份材料 + 测试报告 + 清单不完整'
    required = ['package.json', 'package-lock.json', '.env.example', 'README.md', 'frontend/dist/index.html', 'backend/server.mjs']
    assert all(f'submission/StudyForge-AI/{name}' in names for name in required)
    manifest = json.loads(bundle.read('submission/提交文件清单.json'))
    assert len(manifest['files']) + 1 == len(names), '文件清单数量不一致'
    for item in manifest['files']:
        data = bundle.read(f"submission/{item['path']}")
        assert len(data) == item['bytes'], item['path']
        assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
result = {'passed': True, 'archive': str(archive), 'files': len(names), 'screenshots': 10,
          'course_documents': 10, 'crc_verified': True, 'manifest_sha256_verified': True,
          'credentials_excluded': True, 'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
(root / 'artifacts' / 'package-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"ZIP 核验通过：{len(names)} 个文件，10 张截图，10 份课程文件；CRC、SHA-256、凭据排除均通过。")
