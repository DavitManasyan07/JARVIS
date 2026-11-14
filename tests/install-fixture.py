"""Exercise installation with explicit fake npm and packaged-runtime providers.

All files remain below the repository's ignored .dev directory. Production HOME,
application data, desktop entries, and projects are never changed by this test.
"""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / ".dev/installer fixture with spaces"


def main():
    if FIXTURE.exists():
        shutil.rmtree(FIXTURE)
    source = FIXTURE / "source with spaces"
    home = FIXTURE / "home with spaces"
    mocks = FIXTURE / "mock utilities"
    for directory in (
        source,
        home,
        mocks,
        source / "node_modules/electron",
        source / "build/linux-unpacked",
        source / "assets",
        source / "scripts",
    ):
        directory.mkdir(parents=True, exist_ok=True)

    for filename in ("install.sh", "uninstall.sh"):
        shutil.copy2(ROOT / filename, source / filename)
    shutil.copy2(ROOT / "scripts/sandbox-helper.sh", source / "scripts/sandbox-helper.sh")
    for icon in (ROOT / "assets").iterdir():
        shutil.copy2(icon, source / "assets" / icon.name)
    (source / "package.json").write_text("{}")
    (source / "package-lock.json").write_text("{}")
    (source / "node_modules/electron/install.js").write_text(
        "// Explicit installer fixture: no runtime download.\n"
    )
    shutil.copy2("/bin/true", source / "build/linux-unpacked/jarvis-bin")
    packaged_helper = source / "build/linux-unpacked/chrome-sandbox"
    packaged_helper.write_text("#!/bin/sh\n# Explicit packaged-helper API fixture.\n[ \"$1\" = --get-api ] || exit 1\nprintf '1\\n'\n")
    packaged_helper.chmod(0o755)
    (source / "build/linux-unpacked/.jarvis-managed").write_text(
        json.dumps({"application": "io.jarvis.Desktop", "fixture": True})
    )
    (mocks / "npm").write_text(
        "#!/bin/sh\n# Explicit fixture: package build and npm downloads are mocked.\nexit 0\n"
    )
    (mocks / "npm").chmod(0o755)

    environment = os.environ.copy()
    original_launcher_dir = str(Path.home() / ".local/bin")
    inherited_path = os.pathsep.join(
        part for part in environment["PATH"].split(os.pathsep)
        if str(Path(part).resolve()) != original_launcher_dir
    )
    environment.update(
        HOME=str(home),
        XDG_DATA_HOME=str(home / "data"),
        XDG_CONFIG_HOME=str(home / "config"),
        XDG_CACHE_HOME=str(home / "cache"),
        XDG_STATE_HOME=str(home / "state"),
        PATH=f"{mocks}:{inherited_path}",
    )

    def command(script, *arguments, text=None, check=True):
        return subprocess.run(
            ["bash", str(source / script), *arguments],
            input=text,
            text=True,
            cwd="/",
            env=environment,
            check=check,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

    data = home / "data/jarvis"
    data.mkdir(parents=True)
    database = data / "jarvis.sqlite3"
    database.write_text("preserve-user-data")
    project = home / "project with spaces"
    project.mkdir()
    project_file = project / "important.txt"
    project_file.write_text("preserve-project")
    launcher = home / ".local/bin/jarvis"
    desktop_entry = home / "data/applications/io.jarvis.Desktop.desktop"

    # Resolve the installer relative to itself, from an unrelated current folder.
    for _ in range(2):
        command("install.sh")
        assert (data / "runtime/.jarvis-managed").is_file()
        assert launcher.stat().st_mode & 0o111
        assert database.read_text() == "preserve-user-data"
        assert desktop_entry.is_file()
        runtime_helper = data / "runtime/chrome-sandbox"
        assert runtime_helper.is_symlink(), "The packaged helper must not shadow the trusted helper."
        trusted_helper = runtime_helper.resolve(strict=True)
        helper_stat = trusted_helper.stat()
        assert helper_stat.st_uid == 0 and helper_stat.st_gid == 0
        assert helper_stat.st_mode & 0o7777 == 0o4755
        assert subprocess.check_output([str(trusted_helper), "--get-api"], text=True).strip() == "1"
    helper_before = hashlib.sha256(trusted_helper.read_bytes()).hexdigest()

    def trust_check(candidate, expected="1", unsafe_ancestor=None):
        script = 'source "$1"; jarvis_trusted_sandbox_helper "$2" "$3"'
        if unsafe_ancestor:
            # Explicit metadata fixture: pretend a real helper ancestor is writable.
            script = ('source "$1"; fixture_ancestor=$4; stat() { '
                      'if [[ ${4:-} == "$fixture_ancestor" && ${2:-} == %a ]]; '
                      'then printf "777\\n"; else command stat "$@"; fi; }; '
                      'jarvis_trusted_sandbox_helper "$2" "$3"')
        return subprocess.run(
            ["bash", "-c", script, "--", str(ROOT / "scripts/sandbox-helper.sh"),
             str(candidate), expected, str(unsafe_ancestor or "")],
            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )

    assert trust_check(trusted_helper).returncode == 0
    assert trust_check(trusted_helper, expected="2").returncode != 0
    assert trust_check(packaged_helper).returncode != 0
    assert trust_check(trusted_helper, unsafe_ancestor=trusted_helper.parent).returncode != 0
    alias = source / "trusted helper alias with spaces"
    alias.symlink_to(trusted_helper)
    assert trust_check(alias).stdout.strip() == str(trusted_helper)
    assert (home / ".profile").read_text().count("# JARVIS-MANAGED PATH:") == 1

    # A lost external helper must fail before detaching the packaged application.
    # Change only the fixture's symlink. The real root-owned helper is untouched.
    runtime_helper = data / "runtime/chrome-sandbox"
    runtime_helper.unlink()
    runtime_helper.symlink_to(home / "missing sandbox helper")
    launcher_environment = environment.copy()
    launcher_environment.update(DISPLAY="", WAYLAND_DISPLAY="")
    failed_launch = subprocess.run(
        [str(launcher)], cwd="/", env=launcher_environment,
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert failed_launch.returncode != 0
    assert "sandbox helper is missing, unsafe, or incompatible" in failed_launch.stderr
    assert "Run: bash" in failed_launch.stderr
    assert "startup validation failed" in (home / "state/jarvis/launcher.log").read_text()
    runtime_helper.unlink()
    runtime_helper.symlink_to(packaged_helper)
    assert subprocess.run(
        [str(launcher)], cwd="/", env=launcher_environment,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).returncode != 0
    runtime_helper.unlink()
    runtime_helper.symlink_to(trusted_helper)

    command("uninstall.sh")
    assert not launcher.exists()
    assert not (data / "runtime").exists()
    assert hashlib.sha256(trusted_helper.read_bytes()).hexdigest() == helper_before
    assert database.read_text() == "preserve-user-data"
    assert project_file.read_text() == "preserve-project"

    command("uninstall.sh", "--remove-data", text="no\n")
    assert database.read_text() == "preserve-user-data"
    assert project_file.read_text() == "preserve-project"

    # A conflicting command and a differently named desktop entry stay intact.
    launcher.write_text("#!/bin/sh\n# unrelated fixture\n")
    launcher.chmod(0o755)
    assert command("install.sh", check=False).returncode != 0
    assert "unrelated fixture" in launcher.read_text()
    launcher.unlink()
    conflict = home / "data/applications/unrelated-assistant.desktop"
    conflict.write_text(
        "[Desktop Entry]\nType=Application\nName=JARVIS\nExec=/bin/true\n"
    )
    assert command("install.sh", check=False).returncode != 0
    assert conflict.read_text().endswith("Exec=/bin/true\n")
    conflict.unlink()

    command("install.sh")
    (home / "config/jarvis/voice-key.enc").write_text("fixture-secret")
    command("uninstall.sh", "--remove-data", text="DELETE JARVIS DATA\n")
    assert not database.exists()
    assert not (home / "config/jarvis").exists()
    assert project_file.read_text() == "preserve-project"
    print(
        "Installer fixture checks passed: arbitrary cwd, paths with spaces, rerun, "
        "PATH idempotency, trusted sandbox link/API/ownership and failed-start status, local data preservation, conflicts, confirmed data "
        "removal, project preservation."
    )


if __name__ == "__main__":
    main()
